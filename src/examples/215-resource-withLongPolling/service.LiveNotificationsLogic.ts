import { BaseREService } from '../../BaseREService'
import { withLongPolling } from '../../decorators/withLongPolling'
import { CountdownService } from './service.CountdownService'

export interface NotificationItem {
  id: string
  text: string
  timestamp: string
  type: 'like' | 'message'
}

interface ServerResponse {
  ok: boolean
  notifications: NotificationItem[]
}

// Из кортежа убран сигнал isServerOnline.
// Теперь запуск триггерится строго канонично: по шагу времени или фокусу вкладки!
type TPollingDeps = [isLoopActive: boolean, pollingTick: number, isTabActive: boolean];

export class LiveNotificationsLogic extends BaseREService {
  public countdown = this.engine.inject(CountdownService)

  // Источники правды для UI и графа
  public userIdSignal = this.createSignal<string>('user-123', 'live:signal:user-id')
  public isServerOnline = this.createSignal<boolean>(true, 'live:signal:server-status')
  public pollingTick = this.createSignal<number>(0, 'live:signal:tick')
  public isLoopActive = this.createSignal<boolean>(false, 'live:signal:loop-active')
  public isTabActive = this.createSignal<boolean>(true, 'live:signal:tab-active')

  public receivedNotifications = this.createSignal<NotificationItem[]>([], 'live:signal:feed-list')
  public outgoingBuffer = this.createSignal<NotificationItem[]>([], 'live:signal:outgoing-buffer')

  private feedSessionId = this.createSignal<string>(Math.random().toString(), 'live:signal:session-id')
  private resourceSessionMap = new Map<any, string>()

  // Метрики
  public requestCount = this.createSignal<number>(0, 'live:signal:request-count')
  public currentStatus = this.createSignal<string>('🛑 Поллинг остановлен. Нажмите Init для запуска.', 'live:signal:status')

  // Очищенный реактивный кортеж зависимостей
  private apiDeps = this.engine.computed<TPollingDeps>(() => [
    this.isLoopActive.value,
    this.pollingTick.value,
    this.isTabActive.value
  ], 'live:computed:apiDeps')

  /**
   * ДЕКЛАРАТИВНЫЙ РЕСУРС ЛОНГ-ПОЛЛИНГА
   * Полностью переведен на v2 Options API декоратора withLongPolling с методом onError.
   */
  public notificationsResource = this.engine.resource<ServerResponse | null, TPollingDeps>(
    withLongPolling(
      async (deps, abortSignal) => {
        const [isLoopActive, pollingTick, isTabActive] = deps

        if (!this.isServerOnline.value) {
          this.currentStatus.value = `🚨 Ошибка 502: Нет связи. Буферизируем...`
          throw new Error('502 Bad Gateway')
        }

        this.requestCount.value += 1
        this.currentStatus.value = `📡 [Такт: ${pollingTick}] Удерживаем длинное соединение...`

        const notificationsPayload = [...this.outgoingBuffer.value]
        this.outgoingBuffer.value = []

        const mockPayload: ServerResponse = { ok: true, notifications: notificationsPayload }
        const queryParams = new URLSearchParams({
          userId: String(this.userIdSignal.value),
          tick: String(pollingTick),
          _addData: JSON.stringify(mockPayload)
        }).toString()

        try {
          const response = await fetch(`/fake-feed-vite-proxy/?${queryParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: this.userIdSignal.value, notifications: notificationsPayload }),
            signal: abortSignal
          })

          if (!response.ok) {
            this.outgoingBuffer.value = [...notificationsPayload, ...this.outgoingBuffer.value]
            throw new Error(`Ошибка HTTP: ${response.status}`)
          }

          const jsonResult = await response.json()
          this.resourceSessionMap.set(jsonResult, this.feedSessionId.value)
          return jsonResult
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          this.resourceSessionMap.set(mockPayload, this.feedSessionId.value)
          return mockPayload
        }
      },
      {
        onNextTick: () => this.nextTick(),

        /**
         * Реализует мост между ошибкой декоратора и инфраструктурным UI-таймером.
         *
         * @param {number} ms - Время ожидания в мс до следующей попытки (Backoff).
         * @param {() => void} onRetryScheduled - Сигнальный триггер для фиксации шага экспоненты.
         */
        onError: (ms: number, onRetryScheduled: () => void) => this.countdown.start(ms, onRetryScheduled),

        delay: 3000,
        errorInitialDelay: 2000,
        errorMaxDelay: 8000
      }
    ),
    this.apiDeps,
    {
      name: 'live:resource:notifications',
      resetDataOnSourceChange: true,
      validateBeforeFetch: () => this.isLoopActive.value && this.isTabActive.value,

      responseValidate: (res: any) => {
        const payload = res as ServerResponse | null
        if (!payload || payload.ok !== true) {
          this.currentStatus.value = '🚨 Ошибка валидации структуры ответа'
          return 'Некорректная структура JSON ответа'
        }

        const activeSession = this.feedSessionId.value

        // Сначала жестко проверяем наличие элементов в прилетевшей пачке бэкенда.
        // Если пачка не пустая — мы ВСЕГДА выводим статус успешной доставки, убирая дедлок "Канал чист"!
        if (payload.notifications && payload.notifications.length > 0) {
          const incomingItems = payload.notifications
          const currentList = this.receivedNotifications.value

          // Фильтруем дубликаты
          const filteredItems = incomingItems.filter(item => !currentList.some(exist => exist.id === item.id))

          if (filteredItems.length > 0) {
            this.receivedNotifications.value = [...filteredItems, ...currentList]
            this.currentStatus.value = `⚡ Успешно доставлен пакет из ${filteredItems.length} событий!`
          } else {
            // Если все элементы из пачки уже были в ленте ранее
            this.currentStatus.value = '⏳ Канал обновлен. Новые события уже обработаны.'
          }
        } else {
          // Строго если бэкенд прислал абсолютно пустой массив (нормальный таймаут удержания)
          this.currentStatus.value = '⏳ Канал чист. Новых событий на бэкенде нет.'
        }

        return true
      }
    }
  )

  public setTabVisibility(isActive: boolean) {
    this.isTabActive.value = isActive

    if (isActive) {
      if (this.isLoopActive.value) {
        this.currentStatus.value = '🔄 Вкладка снова активна. Возобновляем лонг-поллинг...'
        this.nextTick()
      }
    } else {
      this.countdown.stop()
      this.currentStatus.value = '⏸️ Вкладка неактивна. Лонг-поллинг временно заморожен.'
    }
  }

  /**
   * ИМПЕРАТИВНЫЙ СТАРТЕР (Init)
   * 🎓 Мы убрали вызов .refetch(). Переключения реактивного сигнала
   * теперь абсолютно достаточно, чтобы движок сам легитимно открыл соединение.
   */
  public startLongPolling = () => {
    if (this.isLoopActive.value) return
    this.isLoopActive.value = true
  }

  public nextTick() {
    if (this.isLoopActive.value && this.isTabActive.value) {
      this.pollingTick.value += 1
    }
  }

  public async triggerEventOnServer(text: string, type: 'like' | 'message') {
    const newItem: NotificationItem = {
      id: Math.random().toString(36).substring(2, 11),
      text,
      timestamp: new Date().toLocaleTimeString(),
      type
    }
    this.outgoingBuffer.value = [...this.outgoingBuffer.value, newItem]
    this.currentStatus.value = `⏳ Событие зафиксировано и ждет отправки.`

    // Если поллинг спит (Destroy) — мы НЕ должны пинать refetch ресурса!
    // События будут копиться в очереди, пока пользователь сам не нажмет Init.
    if (this.isLoopActive.value && this.isServerOnline.value && this.isTabActive.value) {
      this.notificationsResource.refetch()
    }
  }

  /**
   * Изменение isServerOnline больше не дергает транзакции планировщика напрямую.
   * Код работает плавно, без дедлоков рантайма.
   */
  public toggleServerStatus() {
    this.isServerOnline.value = !this.isServerOnline.value

    if (this.isServerOnline.value) {
      this.countdown.stop()
      this.currentStatus.value = '🔄 Сеть найдена. Возобновляем лонг-поллинг...'

      // Пинаем перезапуск только если сам поллинг сейчас активен
      if (this.isLoopActive.value) {
        this.notificationsResource.refetch()
      }
    } else {
      this.currentStatus.value = '🚨 Связь потеряна. Накапливаем буфер.'
      if (this.isLoopActive.value) {
        this.nextTick()
      }
    }
  }

  public clearFeed() {
    this.feedSessionId.value = Math.random().toString()
    this.receivedNotifications.value = []
    this.currentStatus.value = '🗑️ Лента успешно очищена.'
  }

  public destroy() {
    this.countdown.stop()
    this.isLoopActive.value = false
    this.pollingTick.value = 0
    this.resourceSessionMap.clear()
    this.outgoingBuffer.value = []
    this.receivedNotifications.value = []
    this.requestCount.value = 0
    this.isServerOnline.value = true
    this.currentStatus.value = '🛑 Поллинг остановлен. Нажмите Init для запуска.'
  }
}
