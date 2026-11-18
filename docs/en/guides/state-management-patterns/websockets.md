# WebSockets & Real-Time Data Streams

When working with bidirectional real-time streams (market tickers, live chats, collaborative boards, telemetry), it is essential to keep the socket transport layer cleanly separated from reactive application state.

In **`@pravosleva/reactive-engine` v3.0.1**, encapsulating a `WebSocket` instance inside an `AbstractService` provides three key advantages:

1. **Automatic batching of message bursts:** If 20 socket frames arrive within a single millisecond, signal writes inside `onmessage` are automatically coalesced into a single microtask (`queueMicrotask`), sparing the UI from redundant re-renders.
2. **Reactive reconnection via `effect`:** The service observes auth tokens or active channels (such as `activeSymbol.value`) and automatically re-establishes the connection whenever they change.
3. **Zero memory leaks:** On socket close or module teardown, reconnect timers and event listeners are deterministically cleaned up.

## Practical Example: Streaming Market Tickers (`MarketSocketService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface TickerPayload {
  symbol: string
  price: number
  timestamp: number
}

export class MarketSocketService extends AbstractService {
  // Reactive connection parameters
  public activeSymbol = this.engine.signal<string | null>('BTC-USDT', 'ws:activeSymbol')
  public status = this.engine.signal<SocketStatus>('disconnected', 'ws:status')
  public latestTick = this.engine.signal<TickerPayload | null>(null, 'ws:latestTick')
  public lastError = this.engine.signal<string | null>(null, 'ws:lastError')

  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private isManuallyClosed = false

  // Effect is initialized as a class field — no constructor or super(engine) needed
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
   * Opens a new WebSocket connection for the specified trading pair.
   *
   * @param symbol Trading pair or ticker identifier (e.g., `'BTC-USDT'`, `'ETH-USDT'`),
   * read from the reactive `this.activeSymbol.value` signal. Used to build the
   * endpoint URL path and verify subscription relevance during reconnects.
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
          // All writes within the same tick are automatically coalesced (auto-batching)
          this.latestTick.value = parsed
        }
      } catch {
        this.lastError.value = 'Malformed incoming WebSocket message'
      }
    }

    ws.onerror = () => {
      this.lastError.value = 'WebSocket connection error'
    }

    ws.onclose = () => {
      if (!this.isManuallyClosed && this.activeSymbol.value === symbol) {
        this.scheduleReconnect(symbol)
      }
    }
  }

  private scheduleReconnect(symbol: string) {
    this.status.value = 'reconnecting'
    // Exponential backoff: 1s -> 2s -> 4s -> 8s -> max 16s
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

  // Cleanly dispose the service when the feature module unmounts
  public dispose() {
    this.isManuallyClosed = true
    this.stopAutoConnectEffect()
    this.cleanupSocket()
    this.status.value = 'disconnected'
  }
}
```

### Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { MarketSocketService } from './MarketSocketService.js'

const engine = new ReactiveEngine()
const market = engine.inject(MarketSocketService)

// Observe connection status and incoming market ticks
engine.effect(() => {
  console.log(`[WS ${market.status.value}]`, market.latestTick.value)
})

// Switching the active symbol automatically closes the old socket
// and opens a fresh connection for ETH-USDT
market.activeSymbol.value = 'ETH-USDT'

// Send a command frame to the server
market.send({ action: 'subscribe', depth: 10 })

// Clean up resources and timers when leaving the page
// market.dispose()
```

## Production Best Practices

* **Combine with `withThrottleComputed` for high-frequency streams:** If the server pushes 50–100 ticks per second (such as an order book feed), keep the raw `latestTick` signal instant, but drive heavy charts or tables through `withThrottleComputed(engine, () => market.latestTick.value, { limit: 100 })` so the UI re-renders at most 10 times per second.
* **Nullify handlers before calling `.close()`:** Inside `cleanupSocket()`, explicitly reset `onopen`, `onmessage`, `onerror`, and `onclose` to `null` prior to `ws.close()`. This prevents the closing event of the previous socket from accidentally triggering a spurious `scheduleReconnect` cycle when switching channels.
* **Strict payload validation (`unknown` + Type Guards):** Always validate parsed JSON frames with a custom type guard before writing them to a reactive signal so malformed server packets never throw inside downstream computations.
