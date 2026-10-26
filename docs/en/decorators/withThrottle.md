# withThrottle

The `withThrottle` decorator is designed to create a throttling data loader that limits the frequency of calls to an asynchronous function `fetcher`. This is useful when integrating with your core resource system to prevent excessive server requests.

## Syntax

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const throttledFetch = withThrottle(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options?: ThrottleOptions): (source: S, signal: AbortSignal) => Promise<T>;
```

**Option Types (`ThrottleOptions`)**

```typescript
interface ThrottleOptions {
  limit?: number; // Throttling interval in milliseconds. Default is 300 ms.
}
```

## Parameters

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): The original asynchronous fetch function that accepts parameters and an abort signal.
- **options** (`ThrottleOptions`): Throttling configuration options.

## Return Value

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>` — returns a wrapped function preserving the original type signature.

## Examples

### Basic Example

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const fetchUserData = async (userId: string, signal: AbortSignal) => {
  const res = await fetch(`/api/users/${userId}`, { signal });
  return res.json();
};

// Limit the frequency of profile requests to once every 400ms
const throttledFetch = withThrottle(fetchUserData, { limit: 400 });

// Integration with your core resource system
const userResource = engine.resource({
  fetcher: throttledFetch,
  source: () => currentUserId.value
});
```

### Intermediate Calls

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const mockFetcher = async (value: string, signal: AbortSignal) => {
  console.log(`Fetching ${value}`);
  return value;
};

const throttledFetcher = withThrottle(mockFetcher, { limit: 300 });

(async () => {
  try {
    await throttledFetcher('call-1', new AbortController().signal); // Executes immediately
    await throttledFetcher('call-2', new AbortController().signal); // Aborted
    await throttledFetcher('call-3', new AbortController().signal); // Executes on trailing edge

    console.log('Final fetch completed');
  } catch (error) {
    console.error(error.message);
  }
})();
```

### Working with Arrays and Collections

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';
import { ReactiveEngine } from '../../core';

const engine = new ReactiveEngine();
const mockFetcher = async (arr: string[]) => {
  console.log(`Fetching array of length ${arr.length}`);
  return arr;
};

const throttledFetcher = withThrottle(mockFetcher, { limit: 300 });

(async () => {
  const state = engine.reactive({
    items: ['A']
  });

  await throttledFetcher(state.items, new AbortController().signal); // Executes immediately with ['A']

  setTimeout(() => {
    state.items.push('B');
    state.items.push('C');

    throttledFetcher(state.items, new AbortController().signal).then(result => {
      console.log(`Final fetch result: ${result}`);
    });
  }, 150);
})();
```

## Additional Information

The `withThrottle` decorator integrates with the reactive system and ensures proper handling of abort signals (`AbortSignal`). This prevents memory leaks and allows for flexible management of asynchronous operations.
