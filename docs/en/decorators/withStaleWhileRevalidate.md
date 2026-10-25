# withStaleWhileRevalidate

`withStaleWhileRevalidate` is a decorator that implements the "stale-while-revalidate" strategy for data fetching functions. It caches the results of requests and returns stale data from the cache when an error or cancellation occurs during a retry, as long as the TTL (time-to-live) of the cached data is still valid. This helps maintain application continuity and improves performance.

## Syntax

```typescript
withStaleWhileRevalidate<T>(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options: StaleOptions<T> = {}): (source: S, signal: AbortSignal) => Promise<T>
```

## Parameters

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): The data fetching function that takes a source and an abort signal.
- **options** (`StaleOptions<T>`):
  - **ttl** (`number`): The cache time-to-live in milliseconds. Defaults to no limit.
  - **isLogsEnabled** (`boolean`): Enables logging of operations. Defaults to `false`.
  - **maxSize** (`number`): The maximum size of the cache. Defaults to no limit.

## Return Value

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>`
- **Properties**:
  - `data`: Cached data.
  - `savedTime`: Time when the data was saved in the cache.

## Examples

### Basic Usage Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string, signal: AbortSignal) => {
  return `data_for_${source}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher('user_1', abortSignal);
  console.log(res1); // data_for_user_1

  const res2 = await cachedFetcher('user_1', abortSignal);
  console.log(res2); // data_for_user_1 (from cache)
})();
```

### Network Error Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string, signal: AbortSignal) => {
  if (Math.random() < 0.5) throw new Error('Network Error');
  return `data_for_${source}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher('user_1', abortSignal);
  console.log(res1); // data_for_user_1

  try {
    const res2 = await cachedFetcher('user_1', abortSignal);
    console.log(res2); // data_for_user_1 (from cache)
  } catch (error) {
    console.error(error); // Network Error
  }
})();
```

### Proxy Array Mutation Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string[], signal: AbortSignal) => {
  return `data_for_${JSON.stringify(source)}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const engine = new ReactiveEngine();
const state = engine.reactive({
  filters: ['active']
});

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher(state.filters, abortSignal);
  console.log(res1); // data_for_["active"]

  state.filters.push('archived');

  try {
    const res2 = await cachedFetcher(state.filters, abortSignal);
    console.log(res2); // Error (content changed)
  } catch (error) {
    console.error(error); // Error
  }
})();
```

## Additional Information

`withStaleWhileRevalidate` integrates with the core of Reactive Engine to provide reactivity and state management. It is particularly useful in scenarios where network resilience and performance optimization through data caching are required.
