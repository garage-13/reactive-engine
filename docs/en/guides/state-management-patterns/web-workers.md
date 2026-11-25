# Offloading Heavy Computations to Web Workers

When an application needs to parse multi-megabyte CSV/JSON files, aggregate tens of thousands of records, generate reports, or process images on the client, running that logic on the Main Thread blocks the UI and causes animation and input stutter.

In **`@pravosleva/reactive-engine` v3.0.x**, integrating **Web Workers** builds cleanly on top of **`engine.resource()`** and **`AbstractService`**:

1. **Promise wrapper over `postMessage`:** The service encapsulates the `Worker` instance and correlates each message with a unique `requestId`, turning asynchronous worker messaging into a standard `Promise` compatible with `engine.resource()`.
2. **Automatic cancellation of stale runs (`AbortSignal`):** If the user updates filter parameters before the worker finishes the previous job, `resource` automatically triggers `abort()`, rejecting the outdated promise and ignoring late worker replies.
3. **Zero-copy buffer transfers (`Transferable`):** Large `ArrayBuffer` payloads can be transferred across threads without memory cloning.

---

## Practical Example: Background Parsing & Aggregation

### 1. Worker Script (`analytics.worker.ts`)

```typescript
export interface WorkerRequest {
  requestId: number
  rows: number[]
  threshold: number
}

export interface WorkerSuccessResponse {
  requestId: number
  ok: true
  result: {
    matchedCount: number
    average: number
  }
}

export interface WorkerErrorResponse {
  requestId: number
  ok: false
  error: string
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, rows, threshold } = event.data

  try {
    // Simulate a CPU-intensive pass over a large dataset in a background thread
    let sum = 0
    let matchedCount = 0

    for (let i = 0; i < rows.length; i += 1) {
      const val = rows[i]
      if (val >= threshold) {
        sum += val
        matchedCount += 1
      }
    }

    const average = matchedCount > 0 ? sum / matchedCount : 0

    const response: WorkerSuccessResponse = {
      requestId,
      ok: true,
      result: { matchedCount, average },
    }
    self.postMessage(response)
  } catch (err: unknown) {
    const response: WorkerErrorResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown worker error',
    }
    self.postMessage(response)
  }
}
```

### 2. Reactive Service Wrapper (`WorkerAnalyticsService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import type { WorkerRequest, WorkerResponse } from './analytics.worker.js'

interface PendingTask {
  resolve: (value: { matchedCount: number; average: number }) => void
  reject: (reason: unknown) => void
}

export class WorkerAnalyticsService extends AbstractService {
  // Reactive input parameters for background computation
  public dataset = this.engine.signal<number[]>([], 'worker:dataset')
  public threshold = this.engine.signal<number>(50, 'worker:threshold')

  private worker: Worker | null = null
  private nextRequestId = 1
  private pendingTasks = new Map<number, PendingTask>()

  // Combine input signals into a single dependency source for the resource
  private computeInput = this.engine.computed(
    () => ({
      rows: this.dataset.value,
      threshold: this.threshold.value,
    }),
    'worker:computeInput'
  )

  private getOrCreateWorker(): Worker {
    if (this.worker) return this.worker

    // Standard bundler syntax (Vite / Webpack 5) for instantiating a module Web Worker
    const worker = new Worker(new URL('./analytics.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const task = this.pendingTasks.get(msg.requestId)
      if (!task) return

      this.pendingTasks.delete(msg.requestId)

      if (msg.ok) {
        task.resolve(msg.result)
      } else {
        task.reject(new Error(msg.error))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      const err = new Error(event.message || 'Critical Web Worker thread error')
      for (const task of this.pendingTasks.values()) {
        task.reject(err)
      }
      this.pendingTasks.clear()
    }

    this.worker = worker
    return worker
  }

  /**
   * Dispatches a job to the Web Worker and binds its lifecycle to an AbortSignal.
   */
  private runInWorker(
    rows: number[],
    threshold: number,
    signal: AbortSignal
  ): Promise<{ matchedCount: number; average: number }> {
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted before worker postMessage', 'AbortError'))
    }

    const worker = this.getOrCreateWorker()
    const requestId = this.nextRequestId++

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pendingTasks.delete(requestId)
        reject(new DOMException('Worker calculation aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })

      this.pendingTasks.set(requestId, {
        resolve: (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        reject: (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        },
      })

      const payload: WorkerRequest = { requestId, rows, threshold }
      worker.postMessage(payload)
    })
  }

  // Automatically re-runs computation when dataset or threshold changes
  // and cancels any in-flight job on new updates
  public summaryResource = this.engine.resource(
    async ({ rows, threshold }, abortSignal) => {
      if (rows.length === 0) {
        return { matchedCount: 0, average: 0 }
      }
      return this.runInWorker(rows, threshold, abortSignal)
    },
    this.computeInput,
    'worker:summaryResource'
  )

  // Cleanly terminate the worker thread when disposing the module or engine
  public dispose() {
    this.summaryResource.abort()
    for (const task of this.pendingTasks.values()) {
      task.reject(new DOMException('Worker disposed', 'AbortError'))
    }
    this.pendingTasks.clear()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
```

### 3. Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { WorkerAnalyticsService } from './WorkerAnalyticsService.js'

const engine = new ReactiveEngine()
const analytics = engine.inject(WorkerAnalyticsService)

// Observe background computation status
engine.effect(() => {
  const { loading, data, error } = analytics.summaryResource.value

  if (loading) {
    console.log('Computing inside Web Worker (Main Thread remains responsive)...')
    return
  }

  if (error) {
    console.error('Computation error:', error.message)
    return
  }

  if (data) {
    console.log(`Matched items: ${data.matchedCount}, average: ${data.average.toFixed(2)}`)
  }
})

// Generate 500,000 numbers and trigger background aggregation
analytics.dataset.value = Array.from({ length: 500_000 }, () => Math.random() * 100)

// Changing the threshold immediately cancels the in-flight calculation via AbortSignal
// and starts a fresh run with the updated threshold
analytics.threshold.value = 75
```

## Production Best Practices

* **Combine with `withDebounce` for UI sliders:** If a user drags a range slider to update `threshold`, wrap `runInWorker` with `withDebounce(..., { delay: 150 })` so the worker is not flooded with dozens of cancelled array passes per second.
* **Use `Transferable` (`Float64Array` / `ArrayBuffer`) for massive datasets:** Standard `worker.postMessage(rows)` clones arrays via the Structured Clone algorithm. For millions of numbers, store data in a `Float64Array` and transfer buffer ownership without copying memory: `worker.postMessage(payload, [rows.buffer])`.
* **Always call `worker.terminate()` inside `dispose()`:** Browsers do not automatically shut down a `Worker` thread when a service is garbage-collected. Always invoke `worker.terminate()` when destroying the engine instance or leaving the page.
