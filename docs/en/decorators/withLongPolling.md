# Decorator `withLongPolling`

The `withLongPolling` decorator allows creating asynchronous resources that automatically update their dependencies when data changes.

## Syntax

```javascript
withLongPolling(fetcher, options)
```

## Parameters

- **fetcher** (`Function`): An asynchronous function to load data.
  - Accepts two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **options** (`LongPollingOptions`): Options for configuring the polling behavior.

## Return Value

The method returns a function that takes two arguments: `source` and `signal`, and returns a promise with data of type `T`.

## Examples

### Example in Plain JavaScript

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

counter.value++; // Will trigger the resource reload
```

### Example with Response Validation

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

counter.value++; // Will trigger the resource reload
```

## Additional Information

Resources are an important part of the reactive system, allowing automatic updates to UI and other dependencies when data changes.
