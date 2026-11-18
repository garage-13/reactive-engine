# Continuous Server Polling & Exponential Backoff (`withLongPolling`)

When WebSockets or Server-Sent Events (SSE) are overkill or unavailable due to infrastructure constraints, **Long Polling** is the standard pattern for delivering live updates (notifications, background job statuses, activity feeds).

However, naive implementations built around `setInterval` or recursive `setTimeout` quickly lead to memory leaks, overlapping requests on slow networks, and accidental DDoS spikes against a struggling backend.

In **`@pravosleva/reactive-engine` v3.0.1**, these issues are handled out of the box by the **`withLongPolling`** decorator, purpose-built to integrate with `engine.resource()`.

## How the Polling Pipeline Works Under the Hood

1. **Session token isolation (`currentSessionToken`):** Every invocation increments an internal session counter. If query parameters change or the resource refreshes mid-flight, the previous session becomes stale (`activeSessionId !== currentSessionToken`) and will never schedule another timer.
2. **Exponential Backoff:** After a successful response, the next cycle is scheduled after the base `delay` (default: `500 ms`). On network failure, the wait interval progressively doubles from `errorInitialDelay` (`2000 ms`) up to `errorMaxDelay` (`8000 ms`), resetting immediately upon the next successful response.
3. **Dual cancellation circuit:** The pipeline listens to both the per-request `AbortSignal` managed by `resource` and an optional global `externalSignal` (ideal for halting background polling when leaving a route or unmounting a widget).

## Practical Example: Live Notifications Service (`NotificationsService.ts`)

```typescript
import { AbstractService, withLongPolling } from '@pravosleva/reactive-engine'

export interface NotificationItem {
  id: string
  text: string
  createdAt: string
}

export class NotificationsService extends AbstractService {
  public userId = this.engine.signal<string | null>('user-42', 'notifications:userId')

  // Signal for displaying reconnect countdowns in the UI (e.g., "Reconnecting in 4s...")
  public retryDelayMs = this.engine.signal<number | null>(null, 'notifications:retryDelay')

  // External controller to cleanly stop polling when the module is disposed
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
        // Trigger the next polling iteration via the resource's built-in refresh
        this.notificationsResource.refresh()
      },
      onError: (delayMs, scheduleNextStep) => {
        this.retryDelayMs.value = delayMs
        // Acknowledge the failure step so consecutive errors double the backoff delay
        scheduleNextStep()
      },
    }
  )

  public notificationsResource = this.engine.resource<NotificationItem[], string | null>(
    async (uid, abortSignal) => {
      if (!uid) return []
      const items = await this.pollingFetcher(uid, abortSignal)
      // Reset the reconnect delay indicator upon a successful response
      this.retryDelayMs.value = null
      return items
    },
    this.userId,
    {
      name: 'notifications:resource',
      // Halt polling automatically when the user logs out (uid === null)
      validateBeforeFetch: (uid) => Boolean(uid) || 'User is not authenticated',
    }
  )

  // Completely shut down the polling pipeline (e.g., on route leave)
  public stopPolling() {
    this.lifecycleController.abort()
    this.notificationsResource.abort()
  }
}
```

## Usage in Vanilla JS or UI Layer

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { NotificationsService } from './NotificationsService.js'

const engine = new ReactiveEngine()
const notifications = engine.inject(NotificationsService)

// React to incoming notifications and reconnect status
engine.effect(() => {
  const { data, error } = notifications.notificationsResource.value
  const retryMs = notifications.retryDelayMs.value

  if (error && retryMs) {
    console.warn(`Connection lost (${error.message}). Retrying in ${retryMs / 1000}s...`)
    return
  }

  if (data) {
    console.log('Received notifications:', data)
  }
})

// Switching the user ID automatically aborts the previous polling session
// and starts a fresh cycle for the new ID
notifications.userId.value = 'user-99'

// Cleanly stop all background timers when disposing the feature module
// notifications.stopPolling()
```

## Production Best Practices

* **Always pass `externalSignal` for scoped services:** When polling runs inside a temporary widget or an SPA route, create a dedicated `AbortController` inside the service and call `controller.abort()` when the view unmounts. This guarantees immediate cancellation of pending `setTimeout` timers and removes `'abort'` event listeners cleanly.
* **Remember to invoke `scheduleNextStep()` inside `onError`:** The decorator passes an acknowledgement callback as its second argument. Until `scheduleNextStep()` is called, `currentErrorDelay` stays pinned at `errorInitialDelay`. Invoking it signals the decorator to double the backoff interval up to `errorMaxDelay` on consecutive failures.
* **Guard empty sources via `validateBeforeFetch`:** When a user logs out (`userId.value = null`), `validateBeforeFetch` short-circuits the loop before hitting the network, and automatically resumes polling once a valid user ID is restored.
