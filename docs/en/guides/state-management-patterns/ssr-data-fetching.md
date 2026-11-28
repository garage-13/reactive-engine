# Server-Side Rendering (SSR) & Cascading Multi-API Data Fetching

In server-side rendering (Next.js App Router, Nuxt 3/4, Angular Universal, Express/Fastify), generating the initial HTML often requires orchestrating multiple API requests where downstream calls depend on upstream responses, and each step requires **pre-validation** before hitting the network. 

A reliable SSR architecture in @pravosleva/reactive-engine relies on four building blocks: 

1. **Per-request `new ReactiveEngine()` isolation:** prevents cross-request state leakage across concurrent users.
2. **Pre-validation via computed:** an intermediate computed node validates inputs and returns null (or a discriminated union) whenever a request should be skipped.
3. **Cascading `engine.resource()` nodes:** downstream resources reactively subscribe to upstream data and execute automatically once prerequisites succeed.
4. **Graph stabilization via `engine.when()` / `engine.settleResources()`:** the server handler awaits the entire chain with a strict timeoutMs budget and captures a serializable `exportSnapshot()` for client hydration.

## Complete Example: Pre-Validation → User Profile → Organization → Permissions

```typescript
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'

export interface UserDto {
  id: string
  orgId: string
  role: 'admin' | 'member' | 'guest'
}

export interface OrgDto {
  id: string
  title: string
  plan: 'free' | 'enterprise'
}

export interface DashboardSnapshot {
  userId: string
  validationError: string | null
  user: UserDto | null
  org: OrgDto | null
  permissions: string[]
}

export class DashboardSsrService extends AbstractService {
  // 1. Incoming HTTP request parameters (from URL / headers / cookies)
  public rawUserId = this.engine.signal<string>('', 'ssr:rawUserId')
  public authToken = this.engine.signal<string | null>(null, 'ssr:authToken')

  // 2. Synchronous pre-validation before the first network call
  public validatedRequest = this.engine.computed(() => {
    const id = this.rawUserId.value.trim()
    const token = this.authToken.value

    if (!token) {
      return { ok: false as const, reason: 'Unauthorized: missing token' }
    }
    if (!/^[a-z0-9-]{4,36}$/i.test(id)) {
      return { ok: false as const, reason: 'Invalid userId format' }
    }

    return { ok: true as const, userId: id, token }
  }, 'ssr:validatedRequest')

  // 3. API #1: Fetch user profile (runs only when validatedRequest.ok === true)
  public userResource = this.engine.resource(
    async (req, signal) => {
      if (!req.ok) return null

      const res = await fetch(`https://api.example.com/users/${encodeURIComponent(req.userId)}`, {
        headers: { Authorization: `Bearer ${req.token}` },
        signal,
      })
      if (!res.ok) throw new Error(`User API HTTP ${res.status}`)
      return res.json() as Promise<UserDto>
    },
    this.validatedRequest,
    'ssr:userResource'
  )

  // 4. Pre-validation for dependent API #2 (checks API #1 response & user role)
  public orgQuery = this.engine.computed(() => {
    const req = this.validatedRequest.value
    const user = this.userResource.value.data

    if (!req.ok || !user || user.role === 'guest' || !user.orgId) {
      return null
    }

    return { orgId: user.orgId, token: req.token }
  }, 'ssr:orgQuery')

  // 5. API #2: Fetch organization (automatically starts after API #1 resolves)
  public orgResource = this.engine.resource(
    async (query, signal) => {
      if (!query) return null

      const res = await fetch(`https://api.example.com/orgs/${encodeURIComponent(query.orgId)}`, {
        headers: { Authorization: `Bearer ${query.token}` },
        signal,
      })
      if (!res.ok) throw new Error(`Org API HTTP ${res.status}`)
      return res.json() as Promise<OrgDto>
    },
    this.orgQuery,
    'ssr:orgResource'
  )

  // 6. API #3: Fetch permission matrix (depends on both User and Org)
  public permissionsResource = this.engine.resource(
    async ([user, org, req], signal) => {
      if (!req.ok || !user || !org || org.plan !== 'enterprise') {
        return [] as string[]
      }

      const res = await fetch(
        `https://api.example.com/orgs/${encodeURIComponent(org.id)}/permissions/${encodeURIComponent(user.id)}`,
        {
          headers: { Authorization: `Bearer ${req.token}` },
          signal,
        }
      )
      if (!res.ok) throw new Error(`Permissions API HTTP ${res.status}`)
      return res.json() as Promise<string[]>
    },
    () => [this.userResource.value.data, this.orgResource.value.data, this.validatedRequest.value] as const,
    'ssr:permissionsResource'
  )

  // 7. Serializable snapshot for HTML payload injection (Next.js / Nuxt / TransferState)
  public exportSnapshot(): DashboardSnapshot {
    const req = this.validatedRequest.value
    return {
      userId: this.rawUserId.value,
      validationError: req.ok ? null : req.reason,
      user: this.userResource.value.data ?? null,
      org: this.orgResource.value.data ?? null,
      permissions: this.permissionsResource.value.data ?? [],
    }
  }

  // 8. Client-side hydration without redundant network requests
  public hydrate(snapshot: DashboardSnapshot | null) {
    if (!snapshot) return
    this.rawUserId.value = snapshot.userId
    if (snapshot.user) this.userResource.mutate(snapshot.user)
    if (snapshot.org) this.orgResource.mutate(snapshot.org)
    if (snapshot.permissions.length) this.permissionsResource.mutate(snapshot.permissions)
  }
}
```

## Server Request Handler

On the server, create an isolated ReactiveEngine, apply incoming request parameters, and wait for all resources to settle within a strict timeout: 

```typescript
export async function handleSsrRequest(
  userId: string,
  token: string | null,
  requestAbortSignal?: AbortSignal
): Promise<DashboardSnapshot> {
  // 1. Strict isolation per HTTP request
  const serverEngine = new ReactiveEngine()
  const dashboard = serverEngine.inject(DashboardSsrService)

  // 2. Apply request inputs in a single batch
  serverEngine.batch(() => {
    dashboard.rawUserId.value = userId
    dashboard.authToken.value = token
  })

  try {
    // 3. Await the entire cascading chain (capped at 2.5 seconds)
    await serverEngine.settleResources(
      [dashboard.userResource, dashboard.orgResource, dashboard.permissionsResource],
      {
        timeoutMs: 2500,
        signal: requestAbortSignal,
      }
    )
  } catch (err) {
    // On timeout or client disconnect, return whatever data has already resolved
    console.warn('[SSR] Partial hydration fallback:', err)
  }

  // 4. Return a plain JSON snapshot for client hydration
  return dashboard.exportSnapshot()
}
```

## Alternative Approach: Declarative Waiting via `engine.when()` (No `batch` or Resource Array)

When a service involves multiple conditional branches or resources that evolve over time, it is often cleaner to define a **single graph-readiness predicate** using `engine.when()` instead of manually listing every resource in `settleResources()`.

The predicate inside `engine.when()` automatically tracks all signals, `computed` nodes, and resources read during its evaluation, re-checking the condition at every step of the cascade:

```typescript
export async function handleSsrRequestWithWhen(
  userId: string,
  token: string | null,
  requestAbortSignal?: AbortSignal
): Promise<DashboardSnapshot> {
  // 1. Create an isolated container per incoming HTTP request
  const serverEngine = new ReactiveEngine()
  const dashboard = serverEngine.inject(DashboardSsrService)

  // 2. Assign input parameters directly (resources start lazily when read)
  dashboard.rawUserId.value = userId
  dashboard.authToken.value = token

  try {
    // 3. Declaratively wait until the entire cascade (validation + dependent resources) settles
    await serverEngine.when(
      () => {
        // Exit immediately if pre-validation fails—no network requests will be fired
        if (!dashboard.validatedRequest.value.ok) return true

        // Wait for all active cascade stages to finish loading
        return (
          !dashboard.userResource.value.loading &&
          !dashboard.orgResource.value.loading &&
          !dashboard.permissionsResource.value.loading
        )
      },
      {
        timeoutMs: 2500,
        signal: requestAbortSignal,
      }
    )
  } catch (err) {
    // On timeout or client abort, fall back to a partial snapshot for client-side recovery
    console.warn('[SSR] Partial hydration fallback:', err)
  }

  // 4. Export a serializable JSON snapshot to embed into the HTML payload
  return dashboard.exportSnapshot()
}
```

::: info Which one should you choose?
- `settleResources([...])` is ideal when you have a fixed list of independent or cascading resources and want to wait for all of them to settle.
- `engine.when(() => ...)` shines when readiness depends on custom business logic—such as early exit on failed pre-validation (`validatedRequest.value.ok === false`) or role-based branching.
:::

## Best Practices for Safe SSR

1. **Never instantiate `new ReactiveEngine()` at module top level** on the server — always scope it strictly to the incoming request or render tree.
2. **Always enforce `timeoutMs`:** a slow secondary microservice should not block the entire SSR response. Catch timeout errors and return a partial `exportSnapshot()` so the client can finish loading gracefully.
3. **Use computed for pre-validation:** returning null from an intermediate computed node guarantees that downstream resource nodes skip unnecessary network calls.
