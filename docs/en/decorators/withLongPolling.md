# `withLongPolling`

The `withLongPolling` method allows creating asynchronous resources that automatically update their subscribers when data changes using the Long Polling pattern. This decorator is particularly useful for implementing continuous server polling with support for exponential backoff on errors and protection against concurrent session collisions.

## Syntax

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

const pollingFetch = withLongPolling(
  async (source: S, signal) => {
    const res = await fetch(`/api/notifications?uid=${source}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Invalidate or trigger resource refresh in the core
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Network error. Next attempt in ${delay}ms`);
      increaseDelay(); // Double the interval before the next tick
    }
  }
);
```

## Parameters

- **fetcher** (`Function`): An asynchronous function to load data.
  - Accepts two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **options** (`LongPollingOptions`): Options for configuring Long Polling.

## Type `LongPollingOptions`

```typescript
interface LongPollingOptions {
  /** Callback to increment the reactive tick (transition to the next polling iteration) */
  onNextTick: () => void;

  /**
   * Callback invoked when a network error occurs.
   * Allows external systems to know about the failure and the current wait time before the next attempt.
   *
   * @param {number} delayMs - The current Exponential Backoff delay in milliseconds before the next request.
   * @param {() => void} onRetryScheduled - Callback trigger. Must be called once to signal the decorator
   * that the step is fixed and the delay for the next error can be increased.
   */
  onError: (delayMs: number, onRetryScheduled: () => void) => void;

  /** Pause before opening the next connection in milliseconds. Default is 500 ms */
  delay?: number;
  /** Initial Exponential Backoff delay in milliseconds. Default is 2000 ms */
  errorInitialDelay?: number;
  /** Maximum Exponential Backoff delay in milliseconds. Default is 8000 ms */
  errorMaxDelay?: number;
  /** External signal for hard stopping recursive timeouts */
  externalSignal?: AbortSignal;
}
```

## Return Value

- **Type**: A function that accepts `source` and `signal` and returns `Promise<T>`.
- **Methods**:
  - `subscribe`: Subscribes to resource changes.
  - `destroy`: Destroys the resource.

## Examples

### Basic Usage Scenario

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

// Configure the news feed polling function
const pollingFetch = withLongPolling(
  async (userId: string, signal) => {
    const res = await fetch(`/api/notifications?uid=${userId}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Invalidate or trigger resource refresh in the core
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Network error. Next attempt in ${delay}ms`);
      increaseDelay(); // Double the interval before the next tick
    }
  }
);

// Pass the decorator to the core resource subsystem
const notificationResource = engine.resource(
  fetcher: pollingFetch,
  source: () => currentUserId.value
);
```

### Advanced Scenario with Error Handling and Exponential Backoff

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

const pollingFetch = withLongPolling(
  async (userId: string, signal) => {
    const res = await fetch(`/api/notifications?uid=${userId}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Invalidate or trigger resource refresh in the core
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Network error. Next attempt in ${delay}ms`);
      increaseDelay(); // Double the interval before the next tick
    }
  }
);

const notificationResource = engine.resource(
  fetcher: pollingFetch,
  source: () => currentUserId.value
);
```

### Scenario with Proxy-Array Mutation via .push()

```typescript
import { withLongPolling, ReactiveEngine } from '@pravosleva/reactive-engine';

const engine = new ReactiveEngine();
const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `fetched_${arr.join('_')}`);
const mockNextTick = vi.fn();
const mockOnError = vi.fn();
const controller = new AbortController();

const pollingFetcher = withLongPolling(mockFetcher, {
  onNextTick: mockNextTick,
  onError: mockOnError,
  delay: 1000
});

const state = engine.reactive({
  roomIds: ['room_101']
});

const promise1 = pollingFetcher(state.roomIds, controller.signal);
await vi.advanceTimersByTimeAsync(0);

const res1 = await promise1;
expect(res1).toBe('fetched_room_101');
expect(mockFetcher).toHaveBeenCalledWith(['room_101'], controller.signal);

// Imperatively mutate the array — synchronous Proxy immediately updates its state
state.roomIds.push('room_102');

// Launch a second polling session. No more artificial microtasks!
const promise2 = pollingFetcher(state.roomIds, controller.signal);
await vi.advanceTimersByTimeAsync(0);

const res2 = await promise2;

// Decorator natively reads the changed Proxy-array and sends fresh data over the network
expect(res2).toBe('fetched_room_101_room_102');
expect(mockFetcher).toHaveBeenCalledTimes(2);
expect(mockFetcher).toHaveBeenLastCalledWith(['room_101', 'room_102'], controller.signal);
```

## Additional Information

The `withLongPolling` decorator is a crucial part of the reactive system, allowing automatic UI and other dependency updates when data changes using the Long Polling pattern. It provides continuous server polling with support for exponential backoff on errors and protection against concurrent session collisions, making it ideal for implementing real-time data updates.
