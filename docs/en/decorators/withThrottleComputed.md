# withThrottleComputed

Decorator for creating throttled computed values. Allows grouping and limiting the frequency of heavy computations, protecting the dependency graph and UI from excessive updates ("data chattering").

## Syntax

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

interface ThrottleComputedOptions {
  limit: number;
}

export const withThrottleComputed = <T>(
  engine: ReactiveEngine,
  getter: () => T,
  options: ThrottleComputedOptions,
  signalName?: string
) => {
  // Decorator implementation
}
```

## Parameters

- **engine** (`ReactiveEngine`): The instance of the reactive core in which primitives are created.
- **getter** (`() => T`): A function-computer containing reactive signals. Dependencies are collected automatically.
- **options** (`ThrottleComputedOptions`):
  - **limit** (`number`): The delay interval in milliseconds (minimum time between updates).
- **signalName** (`string`, optional): An optional name for debugging purposes. It will be included in system markers.

## Return Value

- **Type**: Object of the computed value interface.
  - **value** (`T`): Getter to read the current throttled value (triggers a pull update).
  - **subscribe** (`(cb: (val: T) => void) => () => void`): Method to subscribe to changes in the value (for UI layer connection).
  - **destroy** (`() => void`): Function to forcibly clear active timers. Must be called when destroying the context.

## Examples

### Basic Example

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

const searchInput = engine.signal('reac', 'search');

// Create a throttled computed: will update no more than once every 300ms
const throttledSearch = withThrottleComputed(
  engine,
  () => executeHeavySearchFilter(searchInput.value),
  { limit: 300 },
  'heavy-search'
);

// Subscribe to the final result
throttledSearch.subscribe((finalResult) => {
  renderSearchResults(finalResult);
});

// Don't forget to call destroy on unmount of component/service
onUnmounted(() => throttledSearch.destroy());
```

### Advanced Example with Error Handling and Subscriptions

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

const dataSignal = engine.signal('initialData');

// Create a throttled computed: will update no more than once every 500ms
const throttledData = withThrottleComputed(
  engine,
  () => fetchDataFromAPI(dataSignal.value),
  { limit: 500 },
  'api-throttling'
);

// Subscribe to the final result and handle errors
throttledData.subscribe((finalResult) => {
  if (finalResult.error) {
    console.error('Error loading data:', finalResult.error);
  } else {
    renderData(finalResult.data);
  }
});

// Don't forget to call destroy on unmount of component/service
onUnmounted(() => throttledData.destroy());
```

## Additional Information

The `withThrottleComputed` decorator integrates with the main reactivity system, automatically collecting dependencies within the provided getter and managing updates through timers. This allows for efficient control over computation frequency, which is especially useful for complex or resource-intensive operations.
