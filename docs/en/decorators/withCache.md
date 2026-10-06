# Decorator `withCache`

The `withCache` decorator allows creating caching data loaders that automatically update subscribed dependencies when the data changes.

## Syntax

```javascript
withCache(fetcher, options)
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

### Example in plain JavaScript

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

## Additional Information

Resources are an important part of the reactive system, allowing automatic updates to UI and other dependencies when data changes.
