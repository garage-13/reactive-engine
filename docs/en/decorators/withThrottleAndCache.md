# withThrottleAndCache

The `withThrottleAndCache` decorator applies rate limiting (throttling) while preserving the last call and checks cache validity before sending a real network request. This decorator also supports operation cancellation through the standard `AbortSignal`.

## Syntax

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';

interface ThrottleAndCacheOptions {
  limit?: number; // Throttling interval in milliseconds. Default is 300 ms.
  ttl?: number;   // Cache time-to-live (TTL) in milliseconds. Default is 5 minutes (300000 ms).
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function withThrottleAndCache<S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options?: ThrottleAndCacheOptions
): (source: S, signal: AbortSignal) => Promise<T>;
```

## Parameters

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): Asynchronous loader function that performs a real network or disk request.
- **options** (`ThrottleAndCacheOptions`):
  - **limit** (`number`, optional): Throttling window in milliseconds (minimum interval between direct calls). Default is 300 ms.
  - **ttl** (`number`, optional): Cache time-to-live (TTL) in milliseconds. Default is 5 minutes (300000 ms).

## Return Value

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>`
- **Description**: Returns a wrapped function that returns `Promise<T>`.

## Examples

### Basic Usage Example

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';

interface SearchQuery { query: string; page: number; }
interface SearchResult { items: string[]; total: number; }

const fetchApi = async (search: SearchQuery, signal: AbortSignal): Promise<SearchResult> => {
  const response = await fetch(`/api/search?q=${search.query}&p=${search.page}`, { signal });
  return response.json();
};

// Create an optimized search function
const optimizedSearch = withThrottleAndCache(fetchApi, { limit: 500, ttl: 60 * 1000 });

// Example call inside a reactive effect
const controller = new AbortController();

optimizedSearch({ query: 'react', page: 1 }, controller.signal)
  .then(data => console.log('Result:', data))
  .catch(err => {
    if (err.name === 'AbortError') console.log('Request aborted by throttler or user');
  });
```

### Advanced Example with Error Handling and Proxy Array Mutations

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

const engine = new ReactiveEngine();
let callCount = 0;

const mockFetcher = async (arr: string[]) => {
  callCount++;
  return `items_count_${arr.length}`;
};

const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 });

const state = engine.reactive({
  ids: ['id_1']
});

const c1 = new AbortController();
const res1 = await optimizedFetcher(state.ids, c1.signal);
console.log('First result:', res1); // Output: items_count_1

state.ids.push('id_2');
state.ids.push('id_3');

const c2 = new AbortController();
const promise2 = optimizedFetcher(state.ids, c2.signal);

await promise2.then(res2 => console.log('Second result:', res2)); // Output: items_count_3
```

## Additional Information

The `withThrottleAndCache` decorator integrates with the reactive system, providing efficient management of request frequency and data caching. It supports operation cancellation through `AbortSignal`, preventing unnecessary requests when conditions change or the user leaves the page.
