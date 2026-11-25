# `when`

The when method (along with the settleResources helper) allows you to asynchronously await a reactive condition (predicate), automatically cleaning up its internal graph subscription once the condition is met, throws an error, or times out. 

## Syntax

```typescript
await engine.when(predicate, options)
await engine.settleResources(resources, options)
```

## Parameters

* **predicate** (`() => boolean`): A reactive condition function. Once it evaluates to true, the returned Promise resolves and the internal effect subscription is automatically disposed.
* **options** (`WhenOptions`, optional): 

  * **timeoutMs** (`number`): Maximum wait time in milliseconds. If exceeded, the subscription is cleaned up and the Promise rejects with a timeout error.
  * **signal** (`AbortSignal`): An external cancellation signal. When aborted, the subscription is cleaned up and the Promise rejects with signal.reason.

## Return Value

Returns a `Promise<void>` that: 

* resolves immediately (fast path without creating an `effect`) if `predicate()` already returns `true` at call time;
* resolves as soon as the reactive condition transitions to `true`;
* rejects if `predicate()` throws an error, `timeoutMs` expires, or the external `AbortSignal` is aborted.

## Examples

### Awaiting Cascading API Requests on the Server (SSR)

In server-side rendering (Next.js, Nuxt, Express), when lets you await the stabilization of dependent resource chains with pre-validation before taking a state snapshot: 

```typescript
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'

class ProfileSsrService extends AbstractService {
  public userId = this.engine.signal<string>('', 'ssr:userId')

  // Pre-validation before the first API call
  public validUserId = this.engine.computed(() => {
    const id = this.userId.value.trim()
    return /^[a-z0-9-]{4,36}$/i.test(id) ? id : null
  }, 'ssr:validUserId')

  // API #1: user profile
  public userResource = this.engine.resource(
    async (id, signal) => {
      if (!id) return null
      const res = await fetch(`https://api.example.com/users/${id}`, { signal })
      return res.json() as Promise<{ id: string; orgId: string }>
    },
    this.validUserId,
    'ssr:userResource'
  )

  // API #2: organization (depends on API #1 response)
  public orgResource = this.engine.resource(
    async (user, signal) => {
      if (!user?.orgId) return null
      const res = await fetch(`https://api.example.com/orgs/${user.orgId}`, { signal })
      return res.json() as Promise<{ id: string; title: string }>
    },
    () => this.userResource.value.data,
    'ssr:orgResource'
  )
}

// Server HTTP request handler
export async function renderProfilePage(requestedId: string) {
  const engine = new ReactiveEngine()
  const service = engine.inject(ProfileSsrService)

  service.userId.value = requestedId

  // Wait for the entire request chain to settle (up to 3 seconds)
  await engine.when(
    () => !service.userResource.value.loading && !service.orgResource.value.loading,
    { timeoutMs: 3000 }
  )

  return {
    user: service.userResource.value.data,
    org: service.orgResource.value.data,
  }
}
```

### Waiting for Multiple Resources (settleResources)

When you need to await multiple independent or cascading resources without manually checking each `.loading` flag: 

```typescript
await engine.settleResources(
  [service.userResource, service.orgResource],
  { timeoutMs: 3000 }
)
```

### Cancelling via AbortSignal

```typescript
const engine = new ReactiveEngine()
const isReady = engine.signal(false)
const controller = new AbortController()

setTimeout(() => controller.abort(new Error('Request cancelled')), 1000)

try {
  await engine.when(() => isReady.value, {
    timeoutMs: 5000,
    signal: controller.signal,
  })
} catch (err) {
  console.error('Wait aborted:', err)
}
```

## Additional Information

* **Leak-free cleanup:** The internal `effect` is guaranteed to be disposed on every outcome (`resolve`, `reject`, `timeoutMs`, or `AbortSignal`).
* **Testing async flows:** `engine.when(() => service.items.value.length > 0)` eliminates arbitrary `setTimeout` delays in integration and unit tests.
