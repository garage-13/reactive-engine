# Интеграция с WebSockets и потоками данных в реальном времени

При работе с двусторонними потоками данных (биржевые котировки, чаты, мультиплеерные доски, живая телеметрия) важно чётко разделять транспортный слой сокета и реактивное состояние приложения.

В **`@pravosleva/reactive-engine` v3.0.1** эта задача решается путём инкапсуляции экземпляра `WebSocket` внутри `AbstractService`:

1. **Автобатчинг входящего спама:** Если за одну миллисекунду по сокету прилетело 20 сообщений, обновления сигналов внутри обработчика `onmessage` автоматически склеиваются в единую микрозадачу (`queueMicrotask`), избавляя UI от лишних перерисовок.
2. **Реактивное переподключение через `effect`:** Сервис сам отслеживает токен авторизации или выбранный канал (например, `activeRoomId.value`) и автоматически переоткрывает соединение при их изменении.
3. **Защита от утечек памяти:** При закрытии соединения или уничтожении модуля таймеры реконнекта и слушатели сокета гарантированно очищаются.

## Практический пример: Сервис потоковых котировок (`MarketSocketService.ts`)

```typescript
import { AbstractService, type ReactiveEngine } from '@pravosleva/reactive-engine'

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface TickerPayload {
  symbol: string
  price: number
  timestamp: number
}

export class MarketSocketService extends AbstractService {
  // Реактивные параметры подключения
  public activeSymbol = this.engine.signal<string | null>('BTC-USDT', 'ws:activeSymbol')
  public status = this.engine.signal<SocketStatus>('disconnected', 'ws:status')
  public latestTick = this.engine.signal<TickerPayload | null>(null, 'ws:latestTick')
  public lastError = this.engine.signal<string | null>(null, 'ws:lastError')

  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private isManuallyClosed = false

  // Эффект инициализируется как поле класса — объявлять constructor и super() не требуется
  private stopAutoConnectEffect = this.engine.effect(() => {
    const symbol = this.activeSymbol.value
    this.cleanupSocket()

    if (!symbol) {
      this.status.value = 'disconnected'
      return
    }

    this.isManuallyClosed = false
    this.connect(symbol)
  }, 'ws:autoConnectEffect')

  /**
   * Открывает новое WebSocket-соединение для указанного торгового инструмента.
   *
   * @param symbol Идентификатор торговой пары или тикера (например, `'BTC-USDT'`, `'ETH-USDT'`),
   * считанный из реактивного сигнала `this.activeSymbol.value`. Используется для формирования
   * URL-пути эндпоинта и сверки актуальности текущей подписки при переподключении.
   */
  private connect(symbol: string) {
    this.status.value = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    this.lastError.value = null

    const ws = new WebSocket(`wss://://example.com{encodeURIComponent(symbol)}`)
    this.socket = ws

    ws.onopen = () => {
      this.status.value = 'connected'
      this.reconnectAttempts = 0
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data)
        if (this.isTickerPayload(parsed)) {
          // Все обновления внутри одного тика автоматически сгруппируются (auto-batching)
          this.latestTick.value = parsed
        }
      } catch {
        this.lastError.value = 'Некорректный формат входящего сообщения'
      }
    }

    ws.onerror = () => {
      this.lastError.value = 'Ошибка WebSocket-соединения'
    }

    ws.onclose = () => {
      if (!this.isManuallyClosed && this.activeSymbol.value === symbol) {
        this.scheduleReconnect(symbol)
      }
    }
  }

  private scheduleReconnect(symbol: string) {
    this.status.value = 'reconnecting'
    // Экспоненциальный откат: 1с -> 2с -> 4с -> 8с -> максимум 16с
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 16000)
    this.reconnectAttempts += 1

    this.reconnectTimer = setTimeout(() => {
      if (!this.isManuallyClosed && this.activeSymbol.value === symbol) {
        this.connect(symbol)
      }
    }, delay)
  }

  public send(payload: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false
    }
    this.socket.send(JSON.stringify(payload))
    return true
  }

  private cleanupSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
  }

  private isTickerPayload(data: unknown): data is TickerPayload {
    return (
      typeof data === 'object' &&
      data !== null &&
      'symbol' in data &&
      typeof data.symbol === 'string' &&
      'price' in data &&
      typeof data.price === 'number' &&
      'timestamp' in data &&
      typeof data.timestamp === 'number'
    )
  }

  // Полная остановка сервиса при размонтировании модуля
  public dispose() {
    this.isManuallyClosed = true
    this.stopAutoConnectEffect()
    this.cleanupSocket()
    this.status.value = 'disconnected'
  }
}
```

### Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { MarketSocketService } from './MarketSocketService.js'

const engine = new ReactiveEngine()
const market = engine.inject(MarketSocketService)

// Отслеживаем статус подключения и поступающие котировки
engine.effect(() => {
  console.log(`[WS ${market.status.value}]`, market.latestTick.value)
})

// Переключение торговой пары автоматически закроет старый сокет
// и откроет новое соединение для ETH-USDT
market.activeSymbol.value = 'ETH-USDT'

// Отправка команды на сервер
market.send({ action: 'subscribe', depth: 10 })

// При уходе со страницы освобождаем ресурсы и таймеры
// market.dispose()
```

## Рекомендации для продакшена

* **Комбинация с `withThrottleComputed` при высокочастотном потоке:** Если сервер присылает 50–100 тиков в секунду (например, биржевой стакан), сам сигнал `latestTick` может обновляться мгновенно, но тяжёлые графики или таблицы стоит подключать через `withThrottleComputed(engine, () => market.latestTick.value, { limit: 100 })`, чтобы UI перерисовывался не чаще 10 раз в секунду.
* **Обнуление обработчиков перед `.close()`:** В методе `cleanupSocket()` явно сбрасывайте `onopen`, `onmessage`, `onerror` и `onclose` в `null` до вызова `ws.close()`. Это гарантирует, что событие закрытия старого сокета не запустит лишний цикл `scheduleReconnect` при переключении канала.
* **Строгая валидация входящих фреймов (`unknown` + Type Guards):** Всегда проверяйте структуру распарсенного JSON через пользовательский type guard перед записью в реактивный сигнал, чтобы повреждённый пакет от сервера не вызвал исключений в downstream-вычислениях.
