# `resource`

The `resource` method allows creating asynchronous resources that automatically update their dependencies when the data changes.

## Syntax

```javascript
engine.resource(fetcher, source, optionsOrName)
```

## Parameters

- **fetcher** (`Function`): An asynchronous function to load data.
  - Takes two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **source** (`{ value: S }`): The source of data, which depends on a signal or computed.

- **optionsOrName** (`string | ResourceOptions<T, S>`): Name or options for the resource.

## Return Value

The method returns an object `Resource`, which has the following properties and methods:

- **`data`**: Data of the resource.
- **`loading`**: Loading state of the resource (true/false).
- **`error`**: Error if an error occurred during data loading.
- **`isRetrying`**: Flag indicating whether a retry is happening.
- **`value`**: Full object state of the resource (`ResourceState<T>`).
- **`refetch()`**: Method to force reload the resource.
- **`subscribe(cb: (val: ResourceState<T>) => void)`**: Subscription to changes in the resource state. Returns a function to clear the subscription.

## Examples

### Example with plain JavaScript

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
const dataResource = engine.resource(fetchData, counter, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Will trigger a resource reload
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
const dataResource = engine.resource(fetchData, counter, {
  name: 'my-resource',
  responseValidate: (data) => !!data || 'Data is empty'
});

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Will trigger a resource reload
```

## Additional Information

Resources are an important part of the reactive system, allowing automatic updates to UI and other dependencies when data changes.
