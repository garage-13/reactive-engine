# `withCache`

The `withCache` decorator allows creating caching data loaders that automatically update subscribed dependencies when the data changes. It helps prevent race conditions and duplicate parallel requests by collapsing them into a single request.

## Syntax

```typescript
withCache(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options?: CacheOptions): (source: S, signal: AbortSignal) => Promise<T>
```

## Parameters

- **fetcher** (`Function`): Asynchronous function to load data.
  - Accepts two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **options** (`CacheOptions`): Caching options.

## Return Value

The method returns a wrapped asynchronous function that has the following properties and methods:

- **`data`**: Data of the resource.
- **`loading`**: Loading state of the resource (true/false).
- **`error`**: Error if an error occurred during data loading.
- **`isRetrying`**: Flag indicating whether a retry is happening.
- **`value`**: Full state object of the resource (`ResourceState<T>`).
- **`refetch()`**: Method to force reload the resource.
- **`subscribe(cb: (val: ResourceState<T>) => void)`**: Subscription to changes in the resource state. Returns a function for clearing the subscription.

## Examples

### Example on plain JavaScript

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Will trigger resource reload
```

### Example with response validation

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, {
  name: 'my-resource',
  responseValidate: (data) => !!data || 'Data is empty'
});

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Will trigger resource reload
```

### Example with network error fallbacks

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, 'my-resource');

dataResource.subscribe((state) => {
  if (state.error) {
    console.error('Network error occurred:', state.error);
  } else {
    console.log('Resource state:', state);
  }
});

counter.value++; // Will trigger resource reload
```

### Example with Proxy-array mutations via .push()

```javascript
const engine = new ReactiveEngine();

const fetchData = async (arr, abortSignal) => {
  return `Array length: ${arr.length}`;
};

const reactiveArray = engine.reactive(['milk']);
const cachedFetch = withCache(fetchData);
const dataResource = engine.resource(cachedFetch, reactiveArray, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

reactiveArray.push('eggs'); // Mutates Proxy-array
```

## Additional Information

The `withCache` decorator is a crucial component of the Reactive Engine library, enabling efficient caching of data requests. It ensures that duplicate parallel requests are collapsed into a single request, reducing network load and improving application performance. The decorator also handles edge cases such as cache warming, network error fallbacks, and reactive array mutations.
