# Async Resources & Race Condition Protection (`resource`)

In **`@pravosleva/reactive-engine` v3.0.x**, network requests and asynchronous workflows are encapsulated in a dedicated declarative primitive: **`engine.resource()`**. It eliminates boilerplate around manual `isLoading` flags, `AbortController` instances, and effects that re-trigger fetches whenever query parameters change.

## How `engine.resource()` Works Under the Hood

The `resource` primitive bridges the reactive dependency graph with the lifecycle of an async operation:

1. **Automatic re-execution:** A resource accepts a reactive dependency source (`source` — a single `signal` or `computed`) and automatically re-runs its `fetcher` whenever that source changes.
2. **Race Condition suppression:** Before starting a new execution, the engine automatically calls `abort()` on the `AbortController` of the previous in-flight request, passing the fresh `abortSignal` as the second argument to `fetcher`.
3. **Pre-flight validation (`validateBeforeFetch`):** Allows you to short-circuit invalid requests (such as search queries below a minimum length) before hitting the network.
4. **Payload validation (`responseValidate`):** Validates the structure of the server response before committing it to `data` and clearing any previous error state.

## Practical Example: Paginated Search with Validation

### 1. Service Definition (`SearchService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

interface UserItem {
  id: number
  name: string
}

interface SearchResponse {
  ok: boolean
  items: UserItem[]
}

export class SearchService extends AbstractService {
  public query = this.engine.signal('', 'search:query')
  public page = this.engine.signal(1, 'search:page')

  // Combine parameters into a single computed dependency source
  private requestDeps = this.engine.computed(
    () => ({
      q: this.query.value.trim(),
      page: this.page.value,
    }),
    'search:deps'
  )

  public usersResource = this.engine.resource<SearchResponse, { q: string; page: number }>(
    async ({ q, page }, abortSignal) => {
      const params = new URLSearchParams({ q, page: String(page) })
      const res = await fetch(`/api/users?${params}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`)
      }

      return res.json()
    },
    this.requestDeps,
    {
      name: 'search:usersResource',
      // Short-circuit before hitting the network if query is shorter than 2 characters
      validateBeforeFetch: ({ q }) => q.length >= 2 || 'Please enter at least 2 characters',
      // Validate server payload structure before committing to data
      responseValidate: (data) => {
        if (!data || data.ok !== true || !Array.isArray(data.items)) {
          throw new Error('Invalid server response format')
        }
        return true
      },
    }
  )

  public setQuery(newQuery: string) {
    this.query.value = newQuery
    this.page.value = 1
  }

  public setPage(newPage: number) {
    this.page.value = newPage
  }
}
```

### 2. Consuming the Service & Subscribing to State

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { SearchService } from './SearchService.js'

const engine = new ReactiveEngine()
const searchService = engine.inject(SearchService)

// Subscribe to resource state
engine.effect(() => {
  const { loading, data, error } = searchService.usersResource.value

  if (loading) {
    console.log('Fetching users...')
    return
  }

  if (error) {
    console.warn('Validation / network status:', error.message)
    return
  }

  if (data) {
    console.log('Users found:', data.items.length)
  }
})

// 1. Triggers validateBeforeFetch -> no network request is sent
searchService.setQuery('a')

// 2. Dispatches the first GET request (/api/users?q=react&page=1)
searchService.setQuery('react')

// 3. Immediately aborts the previous request via AbortController
// and dispatches the fresh one (/api/users?q=reactive&page=1)
searchService.setQuery('reactive')
```

## Manual Resource Control

In addition to automatic re-execution on dependency changes, every `resource` instance exposes imperative control methods:

* **`resource.refresh()`** — forces a re-fetch using the current dependency values (useful for manual "Reload" buttons).
* **`resource.abort()`** — manually cancels the active in-flight network request via `AbortController` without mutating the source signals.

::: tip Handling Aborted Requests
When the engine cancels an outdated request due to a `source` update, browser `fetch` rejects with a `DOMException` named `'AbortError'`. The built-in `resource` primitive automatically recognizes `'AbortError'` and **does not populate the `error` field**, keeping your UI free from false-positive error alerts.
:::
