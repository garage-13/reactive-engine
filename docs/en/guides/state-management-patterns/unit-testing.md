# Unit Testing Services, Signals & Resources (Vitest / Jest)

Because all business logic in **`@pravosleva/reactive-engine` v3.0.1** lives inside pure TypeScript `AbstractService` classes with zero coupling to the DOM or any UI framework, unit tests execute in Node.js in milliseconds—without needing Testing Library or JSDOM component mounts.

## Three Golden Rules for Testing the Reactive Graph

1. **Isolate `new ReactiveEngine()` inside `beforeEach`:** Instead of sharing a global singleton, instantiate a fresh engine before every test. This guarantees 100% isolation of signals, decorator caches, and the DI container across test cases.
2. **Account for microtask batching (`queueMicrotask`):** Because `engine.effect()` and `engine.resource()` schedule updates via microtasks, wait one tick (`await Promise.resolve()` or `await vi.advanceTimersByTimeAsync(...)`) after mutating a signal before asserting side effects.
3. **Fast-forward time deterministically (`vi.useFakeTimers()`):** All time-based decorators (`withDebounce`, `withThrottle`, `withThrottleComputed`, `withLongPolling`) rely on native `setTimeout` and `Date.now()`, making them test instantaneously without real `sleep` delays.

## Practical Example: Testing a Service with DI, `resource` & `withDebounce`

### 1. Service Under Test (`UserSearchService.ts`)

```typescript
import { AbstractService, withDebounce } from '@pravosleva/reactive-engine'

export interface UserDto {
  id: number
  name: string
}

export class ApiClientService extends AbstractService {
  public async searchUsers(query: string, signal: AbortSignal): Promise<UserDto[]> {
    const res = await fetch(`/api/users?q=${encodeURIComponent(query)}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
}

export class UserSearchService extends AbstractService {
  // Inject dependency via the engine's DI container
  private api = this.engine.inject(ApiClientService)

  public query = this.engine.signal('', 'search:query')

  private debouncedSearch = withDebounce<string, UserDto[]>(
    (q, signal) => this.api.searchUsers(q, signal),
    { delay: 300 }
  )

  public usersResource = this.engine.resource(
    this.debouncedSearch,
    this.query,
    {
      name: 'search:usersResource',
      validateBeforeFetch: (q) => q.trim().length >= 2 || 'Minimum 2 characters required',
    }
  )
}
```

### 2. Unit Test Suite (`UserSearchService.spec.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import {
  ApiClientService,
  UserSearchService,
  type UserDto,
} from './UserSearchService.js'

describe('UserSearchService', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    vi.useFakeTimers()
    // Create an isolated core instance for every test case
    engine = new ReactiveEngine()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('blocks network requests when input is shorter than 2 characters (validateBeforeFetch)', async () => {
    const api = engine.inject(ApiClientService)
    const searchSpy = vi.spyOn(api, 'searchUsers')
    const service = engine.inject(UserSearchService)

    service.query.value = 'a'
    await vi.advanceTimersByTimeAsync(350)

    expect(searchSpy).not.toHaveBeenCalled()
    expect(service.usersResource.value.error?.message).toBe('Minimum 2 characters required')
  })

  it('dispatches a single request only after a 300 ms debounce pause', async () => {
    const mockUsers: UserDto[] = [{ id: 1, name: 'Alex' }]
    const api = engine.inject(ApiClientService)
    const searchSpy = vi
      .spyOn(api, 'searchUsers')
      .mockResolvedValue(mockUsers)

    const service = engine.inject(UserSearchService)

    // Simulate rapid sequential typing
    service.query.value = 'Al'
    await vi.advanceTimersByTimeAsync(150)

    service.query.value = 'Ale'
    await vi.advanceTimersByTimeAsync(150)

    service.query.value = 'Alex'
    // Before 300 ms elapse from the last keystroke, no request should fire
    expect(searchSpy).not.toHaveBeenCalled()

    // Fast-forward 300 ms and flush microtasks
    await vi.advanceTimersByTimeAsync(300)

    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(searchSpy).toHaveBeenCalledWith('Alex', expect.any(AbortSignal))
    expect(service.usersResource.value.data).toEqual(mockUsers)
    expect(service.usersResource.value.error).toBeNull()
  })

  it('aborts the previous in-flight request when a new search starts (AbortSignal)', async () => {
    const capturedSignals: AbortSignal[] = []
    const api = engine.inject(ApiClientService)

    vi.spyOn(api, 'searchUsers').mockImplementation(
      (_query: string, signal: AbortSignal) => {
        capturedSignals.push(signal)
        return new Promise<UserDto[]>((resolve) => {
          setTimeout(() => resolve([]), 1000)
        })
      }
    )

    const service = engine.inject(UserSearchService)

    // 1. Trigger the initial request
    service.query.value = 'react'
    await vi.advanceTimersByTimeAsync(300)
    expect(capturedSignals).toHaveLength(1)
    expect(capturedSignals[0].aborted).toBe(false)

    // 2. While the first request is still pending (1000 ms), type a new query
    service.query.value = 'reactive'
    await vi.advanceTimersByTimeAsync(300)

    // The first request's AbortSignal must automatically transition to aborted: true
    expect(capturedSignals[0].aborted).toBe(true)
    expect(capturedSignals).toHaveLength(2)
    expect(capturedSignals[1].aborted).toBe(false)
  })
})
```

## Production Best Practices

* **Use `vi.advanceTimersByTimeAsync()` instead of synchronous `vi.advanceTimersByTime()`:** In `@pravosleva/reactive-engine`, effects and resources are scheduled via `queueMicrotask` and `Promise`. The async helper advances `setTimeout` timers first and then automatically flushes the microtask queue, eliminating manual `await Promise.resolve()` calls.
* **Spy on or mock dependencies via `engine.inject()` before instantiating the consumer service:** Because `engine.inject(ApiClientService)` caches a single instance per `ReactiveEngine`, calling `const api = engine.inject(ApiClientService)` and `vi.spyOn(api, ...)` prior to `engine.inject(UserSearchService)` ensures the service under test receives the mocked dependency.
* **Assert timer and listener cleanup on teardown:** For services using `withLongPolling`, `withThrottleComputed`, `WebSocket`, or `Worker`, include a dedicated test case calling `service.dispose()` and asserting `vi.getTimerCount() === 0` to verify zero dangling macrotasks.
