# Cross-Service Communication & Dependency Injection (DI)

In large-scale applications, business logic rarely fits inside a single monolithic class. Instead of relying on global singletons or tight cross-imports, **`@pravosleva/reactive-engine`** lets you split state into independent domain services and wire them together through its built-in Dependency Injection (DI) container.

## How `inject` Works Inside `AbstractService`

Every service extending `AbstractService` has direct access to its parent engine instance via `this.engine`. Calling `this.engine.inject(TargetService)` inside a constructor or method retrieves the singleton instance of `TargetService` from the current engine's local registry (or lazily instantiates it on first access).

### Key Benefits
* **Zero global state:** Each `new ReactiveEngine()` instance maintains its own isolated service registry. This makes unit testing straightforward (each test gets a clean, isolated graph) and is safe for Server-Side Rendering (SSR).
* **Reactive composition:** Computed values (`computed`) and async resources (`resource`) in one service can directly read signals exposed by another service.
* **Full `nodenext` compatibility:** Type and class imports strictly follow ECMAScript module resolution standards (`.js` extensions in generated `.d.ts` declarations).

## Practical Example: Authentication & Profile Fetching

Consider a two-service setup: `AuthService` (manages the access token) and `ProfileService` (automatically fetches user data once a token is available and cancels in-flight requests on logout).

### 1. Service Layer (`services.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

// Authentication service (manages the access token)
export class AuthService extends AbstractService {
  public token = this.engine.signal<string | null>(null, 'auth:token')

  public isAuthenticated = this.engine.computed(
    () => Boolean(this.token.value),
    'auth:isAuthenticated'
  )

  public login(newToken: string) {
    this.token.value = newToken
  }

  public logout() {
    this.token.value = null
  }
}

// Profile service (depends on AuthService via DI)
export class ProfileService extends AbstractService {
  // Resolve AuthService from the current engine's DI container
  private auth = this.engine.inject(AuthService)

  // Resource automatically reacts to changes in this.auth.token.value
  public profileResource = this.engine.resource(
    async (token, abortSignal) => {
      if (!token) return null

      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch profile: ${res.status}`)
      }

      return res.json()
    },
    this.auth.token,
    {
      name: 'profile:resource',
      // Prevent network requests while token is null
      validateBeforeFetch: (token) => Boolean(token) || 'Authentication required',
    }
  )
}
```

### 2. Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { AuthService, ProfileService } from './services.js'

const engine = new ReactiveEngine()

// Resolve singleton instances from the DI container
const auth = engine.inject(AuthService)
const profile = engine.inject(ProfileService)

// Subscribe to profile resource state
engine.effect(() => {
  const { data, loading, error } = profile.profileResource.value
  console.log({ loading, data, error })
})

// 1. User logs in -> automatically triggers GET /api/me
auth.login('eyJhbGciOiJIUzI1Ni...')

// 2. User logs out -> any in-flight request is immediately aborted via AbortController
auth.logout()
```

::: tip Avoiding Circular DI Dependencies
If `ServiceA` calls `this.engine.inject(ServiceB)` inside its constructor while `ServiceB` simultaneously calls `this.engine.inject(ServiceA)` in its own constructor, the engine will throw a circular dependency error. When bidirectional communication is genuinely required, resolve the dependency lazily inside a method or inside a `computed` / `effect` callback instead.
:::
