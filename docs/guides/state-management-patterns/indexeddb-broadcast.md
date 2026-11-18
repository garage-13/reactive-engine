# Персистентность в IndexedDB и синхронизация вкладок через `BroadcastChannel`

Когда приложению нужно хранить на клиенте крупные объёмы данных — офлайн-черновики документов, кэш справочников на десятки мегабайт, историю сообщений или бинарные вложения (`Blob` / `ArrayBuffer`) — возможностей `localStorage` перестаёт хватать из-за лимита в 5 МБ и блокирующего синхронного API.

Для таких задач используется связка **IndexedDB** + **`BroadcastChannel`**:

1. **Асинхронное чтение и запись в IndexedDB:** Не блокирует основной поток рендеринга и позволяет хранить структурированные объекты без ручной сериализации в строки.
2. **Уведомления между вкладками через `BroadcastChannel`:** В отличие от `localStorage`, у IndexedDB нет встроенного события `'storage'` для соседних вкладок. Поэтому после каждой записи в базу вкладка-инициатор отправляет лёгкое сообщение в `BroadcastChannel`, а соседние вкладки перечитывают актуальные данные из базы через `engine.resource()`.
3. **Защита от гонок при одновременной записи:** Ревизия данных (`revision` или `updatedAt`) позволяет игнорировать устаревшие уведомления.

## Практический пример: Офлайн-хранилище черновиков (`DraftsDbService.ts`)

### 1. Минимальная обёртка над IndexedDB и начало сервиса

```typescript
import { AbstractService, type ResourceState } from '@pravosleva/reactive-engine'

export interface DocumentDraft {
  id: string
  title: string
  content: string
  updatedAt: number
}

interface SyncBroadcastMessage {
  type: 'DRAFTS_UPDATED'
  senderId: string
  draftId: string
}

const DB_NAME = 'app_offline_db_v1'
const STORE_NAME = 'drafts'
const CHANNEL_NAME = 'app:drafts_sync'

export class DraftsDbService extends AbstractService {
  // Уникальный идентификатор текущей вкладки, чтобы не реагировать на собственные события
  private readonly tabId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab_${Math.random().toString(36).slice(2)}`

  // Сигнал-триггер ревизии: инкремент заставляет resource перечитать данные из IndexedDB
  private syncRevision = this.engine.signal(0, 'drafts:syncRevision')

  private dbPromise: Promise<IDBDatabase> | null = null
  private channel: BroadcastChannel | null = this.initBroadcastChannel()

  // Ресурс автоматически загружает список черновиков при старте
  // и при каждом получении сигнала из соседней вкладки
  public draftsResource = this.engine.resource<DocumentDraft[], number>(
    async () => this.getAllFromDb(),
    this.syncRevision,
    'drafts:listResource'
  )

  private initBroadcastChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return null
    }

    const bc = new BroadcastChannel(CHANNEL_NAME)
    bc.onmessage = (event: MessageEvent<unknown>) => {
      if (!this.isSyncMessage(event.data)) return
      if (event.data.senderId === this.tabId) return

      // Соседняя вкладка обновила IndexedDB -> инкрементируем ревизию для перечитки
      this.syncRevision.value += 1
    }
    return bc
  }
    private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB недоступна в текущем окружении'))
        return
      }

      const request = indexedDB.open(DB_NAME, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Ошибка открытия IndexedDB'))
    })

    return this.dbPromise
  }

  private async getAllFromDb(): Promise<DocumentDraft[]> {
    const db = await this.openDb()

    return new Promise<DocumentDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        const items = Array.isArray(request.result)
          ? (request.result as DocumentDraft[])
          : []
        // Сортируем черновики по времени последнего изменения (свежие сверху)
        resolve(items.sort((a, b) => b.updatedAt - a.updatedAt))
      }
      request.onerror = () => reject(request.error ?? new Error('Ошибка чтения из IndexedDB'))
    })
  }

  /**
   * Сохраняет или обновляет черновик в IndexedDB, обновляет текущую вкладку
   * и оповещает все соседние вкладки через BroadcastChannel.
   */
  public async saveDraft(draft: Omit<DocumentDraft, 'updatedAt'>): Promise<void> {
    const db = await this.openDb()
    const record: DocumentDraft = {
      ...draft,
      updatedAt: Date.now(),
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(record)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Ошибка записи в IndexedDB'))
    })

    // Обновляем список в текущей вкладке и оповещаем соседние
    this.syncRevision.value += 1
    this.notifyOtherTabs(record.id)
  }

  public async deleteDraft(draftId: string): Promise<void> {
    const db = await this.openDb()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(draftId)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Ошибка удаления из IndexedDB'))
    })

    this.syncRevision.value += 1
    this.notifyOtherTabs(draftId)
  }

  private notifyOtherTabs(draftId: string) {
    if (!this.channel) return

    const message: SyncBroadcastMessage = {
      type: 'DRAFTS_UPDATED',
      senderId: this.tabId,
      draftId,
    }
    this.channel.postMessage(message)
  }

  private isSyncMessage(data: unknown): data is SyncBroadcastMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'DRAFTS_UPDATED' &&
      'senderId' in data &&
      typeof data.senderId === 'string' &&
      'draftId' in data &&
      typeof data.draftId === 'string'
    )
  }

  public async dispose() {
    this.draftsResource.abort()

    if (this.channel) {
      this.channel.close()
      this.channel = null
    }

    if (this.dbPromise) {
      const db = await this.dbPromise.catch(() => null)
      db?.close()
      this.dbPromise = null
    }
  }
}
```

### 2. Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { DraftsDbService } from './DraftsDbService.js'

const engine = new ReactiveEngine()
const draftsService = engine.inject(DraftsDbService)

// Подписываемся на список черновиков (автоматически обновится при записи в любой вкладке)
engine.effect(() => {
  const { loading, data, error } = draftsService.draftsResource.value

  if (loading && !data) {
    console.log('Чтение черновиков из IndexedDB...')
    return
  }

  if (error) {
    console.error('Ошибка хранилища:', error.message)
    return
  }

  if (data) {
    console.log('Актуальные офлайн-черновики:', data)
  }
})

// Сохраняем черновик:
// 1. Запишет объект в IndexedDB в транзакции readwrite
// 2. Обновит draftsResource в текущей вкладке
// 3. Отправит событие через BroadcastChannel всем соседним вкладкам
await draftsService.saveDraft({
  id: 'draft-101',
  title: 'Архитектура реактивного ядра',
  content: 'Черновик статьи сохранён локально...',
})

// При размонтировании модуля закрываем соединение с БД и канал вкладок
// await draftsService.dispose()
```

## Рекомендации для продакшена

* **Передавайте по `BroadcastChannel` только лёгкие метаданные, а не сами данные:** Не отправляйте многомегабайтные документы внутри `channel.postMessage(...)` — это вызовет двойное копирование памяти. Отправляйте только событие-уведомление (`{ type: 'DRAFTS_UPDATED', draftId }`), а соседние вкладки сами прочитают актуальный срез напрямую из IndexedDB.
* **Фильтруйте собственные сообщения по `tabId`:** Канал `BroadcastChannel` не отправляет сообщение в окно-отправитель, но явная проверка `senderId === this.tabId` защищает от случайных дублей при использовании обёрток или полифилов.
* **Обрабатывайте блокировку обновления схемы (`onblocked`):** Если пользователь открыл две вкладки и в одной из них загрузилась новая версия приложения с увеличенной версией БД (`indexedDB.open(DB_NAME, 2)`), старая вкладка может удерживать соединение. Подписывайтесь на `db.onversionchange = () => db.close()`, чтобы не блокировать миграцию схемы в соседнем окне.
