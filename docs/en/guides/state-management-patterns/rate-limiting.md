# Rate Limiting Requests & Computations (`withDebounce`, `withThrottle`, `withThrottleComputed`)

When dealing with rapid user typing, page scrolling, drag-and-drop gestures, or real-time telemetry streams, the reactive graph can receive dozens of updates per second. Without rate limiting, this triggers cascading network calls or expensive synchronous recomputations.

In **`@pravosleva/reactive-engine` v3.0.1**, three specialized decorators protect both the network and computation layers:

* **`withDebounce`** — delays a network `fetcher` inside `engine.resource()` until incoming updates settle for `delay` milliseconds. Earlier pending promises are rejected with `AbortError`.
* **`withThrottle`** — executes the first request immediately (**Leading edge**), then coalesces intermediate calls within the `limit` window and guarantees execution of the latest state at the end of the window (**Trailing edge**).
* **`withThrottleComputed`** — a synchronous decorator for heavy in-memory computations (large array filtering, layout geometry). Caps the update frequency of a derived signal via an internal scheduler and requires calling `.destroy()` on cleanup.

## 1. Search Input with Debounce (`withDebounce` + `resource`)

The `withDebounce` decorator resets its timer on every keystroke and rejects the previous pending promise with `DOMException('Aborted due to debounce', 'AbortError')`—ensuring `engine.resource()` never treats superseded inputs as errors.

### Service Definition (`AutocompleteService.ts`)

```typescript
import { AbstractService, withDebounce } from '@pravosleva/reactive-engine'

export interface SuggestionItem {
  id: string
  label: string
}

export class AutocompleteService extends AbstractService {
  public searchInput = this.engine.signal('', 'autocomplete:input')

  // Dispatches the HTTP request only 350 ms after typing stops
  private debouncedFetcher = withDebounce<string, SuggestionItem[]>(
    async (query, abortSignal) => {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Suggestions error: ${res.status}`)
      }

      return res.json()
    },
    { delay: 350 }
  )

  public suggestionsResource = this.engine.resource(
    this.debouncedFetcher,
    this.searchInput,
    {
      name: 'autocomplete:suggestions',
      validateBeforeFetch: (q) => q.trim().length >= 2 || 'Minimum 2 characters required',
    }
  )
}
```

## 2. Network Request Throttling (`withThrottle` + `resource`)

Unlike `withDebounce`, which waits for events to stop completely, **`withThrottle`** dispatches the first request immediately (**Leading edge**) and guarantees sending the latest state at most once every `limit` milliseconds (**Trailing edge**), rejecting superseded intermediate calls with `AbortError`.

### Service Definition (`ViewportSyncService.ts`)

```typescript
import { AbstractService, withThrottle } from '@pravosleva/reactive-engine'

interface Coordinates {
  x: number
  y: number
}

export class ViewportSyncService extends AbstractService {
  public position = this.engine.signal<Coordinates>(
    { x: 0, y: 0 },
    'viewport:position'
  )

  // Sends coordinates immediately when movement starts,
  // then at most once every 500 ms (guaranteeing delivery of the final point)
  private throttledSaveFetcher = withThrottle<Coordinates, { saved: boolean }>(
    async (coords, abortSignal) => {
      const res = await fetch('/api/viewport/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Failed to save position: ${res.status}`)
      }

      return res.json()
    },
    { limit: 500 }
  )

  public syncResource = this.engine.resource(
    this.throttledSaveFetcher,
    this.position,
    'viewport:syncResource'
  )
}
```

## 3. Throttling Heavy Synchronous Computations (`withThrottleComputed`)

When there are no network requests involved, but recomputing a large array, graph, or analytics aggregate takes tens of milliseconds of CPU time, use **`withThrottleComputed`**. It wraps a getter inside an internal effect and signal, capping recomputation frequency to `limit` milliseconds.

### Service Definition (`AnalyticsFilterService.ts`)

```typescript
import { AbstractService, withThrottleComputed } from '@pravosleva/reactive-engine'

export interface LogRecord {
  id: number
  message: string
  level: 'info' | 'warn' | 'error'
}

export class AnalyticsFilterService extends AbstractService {
  public rawLogs = this.engine.signal<LogRecord[]>([], 'analytics:rawLogs')
  public filterText = this.engine.signal('', 'analytics:filterText')

  // Heavy filtering fires immediately on the first change,
  // then at most once every 250 ms
  public filteredLogs = withThrottleComputed(
    this.engine,
    () => {
      const query = this.filterText.value.toLowerCase().trim()
      const logs = this.rawLogs.value

      if (!query) return logs
      return logs.filter((item) => item.message.toLowerCase().includes(query))
    },
    { limit: 250 },
    'analytics:filteredLogs'
  )

  // Always clean up the internal scheduler timer when disposing the service/module
  public dispose() {
    this.filteredLogs.destroy()
  }
}
```

## Choosing the Right Decorator

| Criterion | `withDebounce` | `withThrottle` | `withThrottleComputed` |
| :--- | :--- | :--- | :--- |
| **Target layer** | Async `fetcher` (network / I/O) | Async `fetcher` (network / I/O) | Synchronous in-memory getter (CPU) |
| **Execution timing** | Only after an idle pause of `delay` (Trailing) | Immediately on start (Leading) + final value (Trailing) | Immediately on first change + at most once per `limit` |
| **Intermediate calls** | Cancelled with `AbortError` | Overwritten; superseded calls receive `AbortError` | Dropped; only the latest value commits to the signal |
| **Resource cleanup** | Automatic via `AbortSignal` from `resource` | Automatic via `AbortSignal` from `resource` | Requires manual **`.destroy()`** call |
| **Best suited for** | Search inputs, autocomplete, username availability checks | Drag-and-drop coordinate sync, draft auto-save | Filtering 10,000+ table rows, live charts and aggregates |

## Implementation Notes

* **Mandatory `.destroy()` for `withThrottleComputed`:** Unlike network decorators bound to a request's `AbortSignal`, `withThrottleComputed` allocates a long-lived `engine.effect` and an internal `setTimeout`. Whenever you instantiate it inside a dynamic component or scoped service, be sure to call `throttled.destroy()` on unmount to prevent timer leaks.
* **100% Fake Timers compatibility in tests:** All three decorators rely on native `setTimeout` and `Date.now()`, allowing you to deterministically fast-forward time in Vitest or Jest using `vi.advanceTimersByTime(delay)` without real wall-clock delays.
