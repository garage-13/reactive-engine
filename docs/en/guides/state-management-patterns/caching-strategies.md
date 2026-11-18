# Request Caching Strategies (`withCache` & `withStaleWhileRevalidate`)

In production applications, lookup tables, user profiles, and filtered search results are frequently requested multiple times during navigation or simultaneously across independent widgets.

In **`@pravosleva/reactive-engine` v3.0.1**, this problem is solved by two composable fetcher decorators that integrate seamlessly with `engine.resource()` and honor `AbortSignal`:

* **`withCache`** — **Cache-First strategy with TTL and Request Collapsing**. While a cached entry is fresh, no network request is dispatched. If multiple consumers request the same key concurrently, only a single network call is made while all callers share the active `Promise`.
* **`withStaleWhileRevalidate`** — **Network-First strategy with resilient fallback and LRU eviction (`maxSize`)**. Always attempts to fetch fresh data from the server, but falls back to valid cached data if a network error or request cancellation occurs.

## Strategy 1: TTL Caching & Request Collapsing (`withCache`)

Ideal for reference data, user profiles, and heavy reports that do not change every second.

### Service Definition (`CatalogService.ts`)

```typescript
import { AbstractService, withCache } from '@pravosleva/reactive-engine'

export interface ProductItem {
  id: string
  title: string
  price: number
}

interface CatalogQuery {
  category: string
  currency: 'USD' | 'EUR'
}

export class CatalogService extends AbstractService {
  public category = this.engine.signal('laptops', 'catalog:category')
  public currency = this.engine.signal<'USD' | 'EUR'>('USD', 'catalog:currency')

  // Cache key is deterministically serialized via JSON.stringify(source)
  private queryParams = this.engine.computed<CatalogQuery>(
    () => ({
      category: this.category.value,
      currency: this.currency.value,
    }),
    'catalog:query'
  )

  // Wrap the fetcher: cache lives for 60 seconds, concurrent duplicates collapse
  private cachedFetchProducts = withCache<CatalogQuery, ProductItem[]>(
    async ({ category, currency }, abortSignal) => {
      const params = new URLSearchParams({ category, currency })
      const res = await fetch(`/api/products?${params}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch catalog: ${res.status}`)
      }

      return res.json()
    },
    { ttl: 60 * 1000 }
  )

  public productsResource = this.engine.resource(
    this.cachedFetchProducts,
    this.queryParams,
    'catalog:productsResource'
  )
}
```

## Strategy 2: Resilient Fallback & LRU Memory (`withStaleWhileRevalidate`)

Unlike `withCache`, the `withStaleWhileRevalidate` decorator always attempts to fetch the freshest data from the server on every call. However, if the network is unstable, the server returns an error, or the request is aborted, it protects the UI by returning the last valid cached entry.

Additionally, setting `maxSize` turns the internal `Map` into an **LRU (Least Recently Used) cache**: once the capacity limit is reached, the least recently accessed key is automatically evicted.

### Service Definition (`RatesService.ts`)

```typescript
import {
  AbstractService,
  withStaleWhileRevalidate,
} from '@pravosleva/reactive-engine'

interface ExchangeRate {
  pair: string
  rate: number
  updatedAt: string
}

export class RatesService extends AbstractService {
  public currencyPair = this.engine.signal('EUR/USD', 'rates:pair')

  // Retain at most 20 currency pairs in memory,
  // keeping fallback entries valid for 10 minutes
  private resilientFetcher = withStaleWhileRevalidate<string, ExchangeRate>(
    async (pair, abortSignal) => {
      const res = await fetch(`/api/rates?pair=${encodeURIComponent(pair)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Quotes gateway failure: ${res.status}`)
      }

      return res.json()
    },
    {
      ttl: 10 * 60 * 1000,
      maxSize: 20,
      isLogsEnabled: true,
    }
  )

  public rateResource = this.engine.resource(
    this.resilientFetcher,
    this.currencyPair,
    'rates:resource'
  )
}
```

## Strategy 2: Resilient Fallback & LRU Memory (`withStaleWhileRevalidate`)

Unlike `withCache`, the `withStaleWhileRevalidate` decorator always attempts to fetch the freshest data from the server on every call. However, if the network is unstable, the server returns an error, or the request is aborted, it protects the UI by returning the last valid cached entry.

Additionally, setting `maxSize` turns the internal `Map` into an **LRU (Least Recently Used) cache**: once the capacity limit is reached, the least recently accessed key is automatically evicted.

### Service Definition (`RatesService.ts`)

```typescript
import {
  AbstractService,
  withStaleWhileRevalidate,
} from '@pravosleva/reactive-engine'

interface ExchangeRate {
  pair: string
  rate: number
  updatedAt: string
}

export class RatesService extends AbstractService {
  public currencyPair = this.engine.signal('EUR/USD', 'rates:pair')

  // Retain at most 20 currency pairs in memory,
  // keeping fallback entries valid for 10 minutes
  private resilientFetcher = withStaleWhileRevalidate<string, ExchangeRate>(
    async (pair, abortSignal) => {
      const res = await fetch(`/api/rates?pair=${encodeURIComponent(pair)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Quotes gateway failure: ${res.status}`)
      }

      return res.json()
    },
    {
      ttl: 10 * 60 * 1000,
      maxSize: 20,
      isLogsEnabled: true,
    }
  )

  public rateResource = this.engine.resource(
    this.resilientFetcher,
    this.currencyPair,
    'rates:resource'
  )
}
```
