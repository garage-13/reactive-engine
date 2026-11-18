# Непрерывный опрос сервера и Exponential Backoff (`withLongPolling`)

Когда WebSocket или Server-Sent Events (SSE) избыточны или недоступны из-за ограничений инфраструктуры, для получения живых обновлений (уведомлений, статусов фоновых задач, лент событий) используется паттерн **Long Polling**.

Однако наивная реализация через `setInterval` или рекурсивный `setTimeout` быстро приводит к утечкам памяти, наложению параллельных запросов при медленной сети и DDoS-атаке на собственный бэкенд при его падении.

В **`@pravosleva/reactive-engine` v3.0.1** эти проблемы решает декоратор **`withLongPolling`**, спроектированный специально для связки с `engine.resource()`.

## Как устроен конвейер под капотом

1. **Контроль сессионных токенов (`currentSessionToken`):** Каждый новый запуск инкрементирует внутренний счётчик сессии. Если пользователь сменил параметры поиска или перезапустил ресурс, старая сессия теряет актуальность (`activeSessionId !== currentSessionToken`) и не взведёт следующий таймер.
2. **Экспоненциальный откат (`Exponential Backoff`):** После успешного ответа следующий цикл запускается через базовый интервал `delay` (по умолчанию `500 мс`). При сетевой ошибке задержка прогрессивно удваивается от `errorInitialDelay` (`2000 мс`) до потолка `errorMaxDelay` (`8000 мс`), а при первом же успешном ответе сбрасывается обратно к начальному значению.
3. **Двойной контур отмены:** Конвейер слушает как локальный `AbortSignal` конкретного запроса от `resource`, так и глобальный `externalSignal` (например, для полной остановки фонового поллинга при уходе со страницы или размонтировании виджета).

## Практический пример: Сервис живых уведомлений (`NotificationsService.ts`)

```typescript
import { AbstractService, withLongPolling } from '@pravosleva/reactive-engine'

export interface NotificationItem {
  id: string
  text: string
  createdAt: string
}

export class NotificationsService extends AbstractService {
  public userId = this.engine.signal<string | null>('user-42', 'notifications:userId')

  // Сигнал для отображения статуса реконнекта в UI (например, «Переподключение через 4с...»)
  public retryDelayMs = this.engine.signal<number | null>(null, 'notifications:retryDelay')

  // Внешний контроллер для полной остановки поллинга при закрытии модуля
  private lifecycleController = new AbortController()

  private pollingFetcher = withLongPolling<string, NotificationItem[]>(
    async (uid, abortSignal) => {
      const res = await fetch(`/api/notifications?uid=${encodeURIComponent(uid)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      return res.json()
    },
    {
      delay: 1500,
      errorInitialDelay: 2000,
      errorMaxDelay: 16000,
      externalSignal: this.lifecycleController.signal,
      onNextTick: () => {
        // Триггерим следующую итерацию опроса через штатный метод ресурса
        this.notificationsResource.refresh()
      },
      onError: (delayMs, scheduleNextStep) => {
        this.retryDelayMs.value = delayMs
        // Подтверждаем шаг, чтобы при следующей подряд ошибке задержка удвоилась
        scheduleNextStep()
      },
    }
  )

    public notificationsResource = this.engine.resource<NotificationItem[], string | null>(
    async (uid, abortSignal) => {
      if (!uid) return []
      const items = await this.pollingFetcher(uid, abortSignal)
      // Сбрасываем индикатор задержки реконнекта при успешном ответе
      this.retryDelayMs.value = null
      return items
    },
    this.userId,
    {
      name: 'notifications:resource',
      // Останавливаем опрос, если пользователь разлогинился (uid === null)
      validateBeforeFetch: (uid) => Boolean(uid) || 'Пользователь не авторизован',
    }
  )

  // Полная остановка конвейера опроса (например, при уходе со страницы)
  public stopPolling() {
    this.lifecycleController.abort()
    this.notificationsResource.abort()
  }
}
```

## Использование в чистом JS (или UI-слое)
```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { NotificationsService } from './NotificationsService.js'

const engine = new ReactiveEngine()
const notifications = engine.inject(NotificationsService)

// Отслеживаем поступление новых уведомлений и статус реконнекта
engine.effect(() => {
  const { data, error } = notifications.notificationsResource.value
  const retryMs = notifications.retryDelayMs.value

  if (error && retryMs) {
    console.warn(`Связь потеряна (${error.message}). Повтор через ${retryMs / 1000} сек...`)
    return
  }

  if (data) {
    console.log('Получены уведомления:', data)
  }
})

// Смена пользователя автоматически отменит старую сессию поллинга
// и запустит опрос для нового ID с чистого листа
notifications.userId.value = 'user-99'

// При завершении работы модуля полностью останавливаем фоновые таймеры
// notifications.stopPolling()
```

## Рекомендации для продакшена

* **Всегда передавайте `externalSignal` для модульных сервисов:** Если опрос запускается внутри временного виджета или отдельной страницы SPA, создавайте локальный `AbortController` внутри сервиса и вызывайте `controller.abort()` при уничтожении экрана. Это гарантирует мгновенную остановку запланированных таймеров `setTimeout` и очистку слушателей событий `'abort'`.
* **Не забывайте вызывать `scheduleNextStep()` внутри `onError`:** Декоратор передаёт вторым аргументом колбэк подтверждения шага. Пока вы не вызовете `scheduleNextStep()`, задержка `currentErrorDelay` останется фиксированной на уровне `errorInitialDelay`. Вызов этого колбэка сообщает декоратору, что прогрессивное удвоение до `errorMaxDelay` разрешено.
* **Блокируйте пустой источник через `validateBeforeFetch`:** Если пользователь разлогинился (`userId.value = null`), `validateBeforeFetch` остановит цикл до выхода в сеть, а при повторном входе ресурс автоматически возобновит поллинг.
