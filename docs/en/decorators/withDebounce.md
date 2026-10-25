# `withDebounce`

The `withDebounce` decorator allows creating debounced functions that delay the execution of asynchronous operations for a specified time. This is useful for optimizing performance, such as when handling user input events.

## Syntax

```typescript
withDebounce<S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options?: DebounceOptions
): (source: S, signal: AbortSignal) => Promise<T>
```

**Debounce Options (`DebounceOptions`)**

```typescript
interface DebounceOptions {
  delay?: number; // Delay in milliseconds. Default is 300 ms.
}
```

## Parameters

- **fetcher** (`Function`): Asynchronous function to load data.
  - Accepts two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **options** (`DebounceOptions`): Debounce options.

## Return Value

The method returns a wrapped function that accepts `source` and `signal`, and returns a promise with data of type `T`.

## Examples

### Example in plain JavaScript

```javascript
const engine = new ReactiveEngine();

const fetchData = async (query, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?query=${encodeURIComponent(query)}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const querySignal = engine.signal('', 'search:signal:query');

querySignal.subscribe((query) => {
  debouncedFetch(query, new AbortController().signal).then(data => {
    console.log('Fetched data:', data);
  }).catch(error => {
    console.error('Error fetching data:', error);
  });
});

// Update querySignal on user input
```

### Example with integration in `resource`

```javascript
const engine = new ReactiveEngine();

const fetchData = async (query, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?query=${encodeURIComponent(query)}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const querySignal = engine.signal('', 'search:signal:query');
const searchResource = engine.resource(debouncedFetch, querySignal, 'my-resource');

searchResource.subscribe((state) => {
  console.log('Resource state:', state);
});

// Update querySignal on user input
```

### Example with network error fallback

```javascript
const engine = new ReactiveEngine();

const fetchData = async (query, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?query=${encodeURIComponent(query)}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const querySignal = engine.signal('', 'search:signal:query');

querySignal.subscribe((query) => {
  debouncedFetch(query, new AbortController().signal).then(data => {
    console.log('Fetched data:', data);
  }).catch(error => {
    console.error('Error fetching data:', error);
  });
});

// Update querySignal on user input
```

### Example with Proxy-array mutations via .push()

```javascript
const engine = new ReactiveEngine();

const fetchData = async (filters, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?filters=${encodeURIComponent(filters.join(','))}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const state = engine.reactive({
  filters: ['js']
});

const querySignal = engine.signal(state.filters, 'search:signal:filters');

querySignal.subscribe((filters) => {
  debouncedFetch(filters, new AbortController().signal).then(data => {
    console.log('Fetched data:', data);
  }).catch(error => {
    console.error('Error fetching data:', error);
  });
});

// Add a new filter
state.filters.push('ts');
```

## Additional Information

The `withDebounce` decorator is useful for optimizing server requests, especially when handling user input events. It allows delaying the execution of requests until the user stops typing, reducing unnecessary requests and improving performance.

## Example Usage

<<< ../../examples/211-resource-withDebounce/service.SearchLogic.ts{ts}

<<< ../../examples/211-resource-withDebounce/Example211.tsx{tsx}
