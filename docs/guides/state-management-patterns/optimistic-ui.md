# Оптимистичные обновления интерфейса (Optimistic UI)

При выполнении частых пользовательских действий — постановке лайка, переключении статуса задачи или изменении количества товара в корзине — ожидание ответа от сервера перед перерисовкой экрана создаёт ощущение медленного интерфейса.

Паттерн **Optimistic UI** позволяет обновить состояние мгновенно в момент клика, отправить запрос в фоне и автоматически откатить интерфейс к исходному снимку, если сервер вернул ошибку.

## Как это реализуется в `@pravosleva/reactive-engine`

1. **Снимок состояния (Snapshot) до мутации:** Перед оптимистичным обновлением мы сохраняем текущее значение сигнала в локальную константу (`previousSnapshot`).
2. **Мгновенная запись в `signal`:** Интерфейс перерисовывается синхронно в текущем тике без ожидания сети.
3. **Защита от гонок и откат при ошибке:** Сетевая мутация выполняется с передачей `AbortSignal` (если пользователь кликнул дважды подряд, устаревший запрос прерывается), а блок `catch` восстанавливает `previousSnapshot`, если запрос завершился с ошибкой сети или HTTP-статусом `>= 400`.

## Практический пример: Переключение статуса задачи (Todo Toggle)

### 1. Описание сервиса (`TodosService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export interface TodoItem {
  id: string
  title: string
  completed: boolean
}

export class TodosService extends AbstractService {
  // Основной список задач
  public items = this.engine.signal<TodoItem[]>(
    [
      { id: '1', title: 'Обновить ядро до v3.0.1', completed: true },
      { id: '2', title: 'Написать документацию по паттернам', completed: false },
    ],
    'todos:items'
  )

  // Сигнал последней ошибки синхронизации (для показа toast-уведомления)
  public syncError = this.engine.signal<string | null>(null, 'todos:syncError')

  // Храним активные AbortController по ID задачи для отмены повторных кликов
  private pendingControllers = new Map<string, AbortController>()

  public async toggleTodo(todoId: string) {
    // 1. Отменяем предыдущий незавершённый запрос по этой же задаче
    this.pendingControllers.get(todoId)?.abort()
    const controller = new AbortController()
    this.pendingControllers.set(todoId, controller)

    // 2. Сохраняем снимок состояния до оптимистичной мутации
    const previousSnapshot = this.items.value
    const targetItem = previousSnapshot.find((item) => item.id === todoId)
    if (!targetItem) return

    const nextCompleted = !targetItem.completed

    // 3. Оптимистично обновляем UI мгновенно (сбрасываем старую ошибку)
    this.syncError.value = null
    this.items.value = previousSnapshot.map((item) =>
      item.id === todoId ? { ...item, completed: nextCompleted } : item
    )

    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка сервера: ${res.status}`)
      }

      // При необходимости синхронизируемся с каноничным ответом сервера
      const updatedFromServer: TodoItem = await res.json()
      this.items.value = this.items.value.map((item) =>
        item.id === todoId ? updatedFromServer : item
      )
    } catch (err: any) {
      // Игнорируем отмену, вызванную более новым кликом пользователя
      if (err?.name === 'AbortError') return

      // 4. Откатываем состояние к снимку и фиксируем ошибку
      this.items.value = previousSnapshot
      this.syncError.value = err?.message || 'Не удалось сохранить изменения'
    } finally {
      if (this.pendingControllers.get(todoId) === controller) {
        this.pendingControllers.delete(todoId)
      }
    }
  }
}
```

### 2. Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { TodosService } from './TodosService.js'

const engine = new ReactiveEngine()
const todos = engine.inject(TodosService)

// Подписываемся на список задач и ошибки синхронизации
engine.effect(() => {
  console.log('Актуальный список задач:', todos.items.value)
})

engine.effect(() => {
  if (todos.syncError.value) {
    console.error('Показать toast-уведомление:', todos.syncError.value)
  }
})

// Пользователь кликает по задаче #2:
// 1. UI мгновенно покажет completed: true
// 2. Если сервер вернёт 500, задача #2 вернётся в completed: false,
//    а syncError получит сообщение об ошибке
todos.toggleTodo('2')
```

## Рекомендации для продакшена

* **Точечный откат при параллельных кликах:** В примере выше `previousSnapshot` восстанавливает весь массив `items`. Если пользователь за одну секунду переключил сначала задачу `#1`, а затем задачу `#2`, и запрос по `#1` упал с ошибкой в момент, когда `#2` уже успешно сохранилась, полный откат массива затрёт изменение `#2`. В таких сценариях откатывайте **только целевой элемент** по его `id` (возвращая `completed: !nextCompleted`), а не весь список целиком.
* **Транзакционный логгер для отладки:** При включённом логгере (`new ReactiveEngine({ logger: { isEnabled: true } })`) вы наглядно увидите в консоли два раздельных батча: мгновенную оптимистичную мутацию и последующий откат при сбое сети.
