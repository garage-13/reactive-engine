# 🚀 ReactiveEngine Core Framework (Instruction in English 🇬🇧)
A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.

https://t.me/bash_exp_ru/3393

# @pravosleva/reactive-engine 🚀

A lightweight, ultra-performant, and framework-agnostic reactive engine powered by Signals and transparent dependency tracking, tailored for React and TypeScript applications.

---

## ⚡ Why is this approach performant?

Unlike traditional State Management in React (via Context API or immutability-based global stores), `@pravosleva/reactive-engine` works on the principle of **fine-grained reactivity**:

* **Minimal Re-renders:** Components subscribe directly to specific primitive signals (`Signal`) or derived values (`Computed`) they render on the screen, rather than the entire state object. Changing a single signal updates *only* the component that actually reads it.
* **O(1) Computations:** `Computed` properties are lazy. They are never recalculated until their underlying dependency signals change.
* **Automatic Batching:** The engine groups multiple signal modifications into "batches" using microtasks. Network resources or heavy effects won't re-trigger 10 times in a row when updating 10 signals within the same synchronous execution block.
* **Smart Asynchrony:** The `resource` tool orchestrates a native `AbortController` out of the box, automatically cancelling stale pending network requests whenever dependencies change.

---

## 📦 Installation

Install the package via your favorite package manager:

```bash
npm install @pravosleva/reactive-engine
# or
yarn add @pravosleva/reactive-engine
# or
pnpm add @pravosleva/reactive-engine
```

---

## 🛠️ Basic Examples

### 1. Initializing the Engine and Signals

You can declare your reactive state in pure TypeScript/JavaScript files completely outside the React component tree.

```ts
// store.ts
import { ReactiveEngine } from '@pravosleva/reactive-engine';

export const engine = new ReactiveEngine();

// Simple observable state (Signal)
export const counterSignal = engine.signal(0, 'counter');

// Derived state (Computed)
export const doubleComputed = engine.computed(
  () => counterSignal.value * 2,
  'double_counter'
);
```

### 2. Consuming State in React Components

For React 18+, use the high-performance `useReactiveValue` hook (backed by `useSyncExternalStore`). For older React versions (16.8+), use the fallback `useReactiveValue0` hook.

```tsx
// Counter.tsx
import React from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { counterSignal, doubleComputed } from './store';

export const Counter = () => {
  // The hook automatically subscribes to changes and triggers a re-render
  const count = useReactiveValue(counterSignal);
  const doubleCount = useReactiveValue(doubleComputed);

  return (
    <div style={{ padding: 20 }}>
      <h3>Counter: {count}</h3>
      <p>Double Value: {doubleCount}</p>

      <button onClick={() => counterSignal.value++}>Increment</button>
      <button onClick={() => counterSignal.value--}>Decrement</button>
    </div>
  );
};
```

---

## 🔥 Advanced Examples

### 1. Async Resources Dependent on Multiple Signals

If your network request depends on filters, pagination, or a user ID, combine them using a `computed` property. The `resource` utility will automatically track them, trigger fresh fetch logic, and cancel previous requests.

```ts
// apiStore.ts
import { engine } from './store';

export const userIdSignal = engine.signal(1, 'userId');
export const tabSignal = engine.signal<'posts' | 'todos'>('posts', 'tab');

// Combine multiple signals into a single derived dependency array
const requestDeps = engine.computed(() => {
  return [userIdSignal.value, tabSignal.value] as const;
});

// Create a reactive asynchronous resource
export const userDataResource = engine.resource(
  async ([userId, tab], abortSignal) => {
    const res = await fetch(`https://typicode.com{userId}/${tab}`, {
      signal: abortSignal, // Pass the native cancellation token
    });
    if (!res.ok) throw new Error('Failed to fetch data');
    return res.json();
  },
  requestDeps, // Pass dependencies here
  'userData'
);
```

Consuming this in a component remains clean and fully declarative:

```tsx
// UserProfile.tsx
import React from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { userIdSignal, tabSignal, userDataResource } from './apiStore';

export const UserProfile = () => {
  // Read the resource state object: { data, loading, error }
  const { data, loading, error } = useReactiveValue(userDataResource);
  const tab = useReactiveValue(tabSignal);

  return (
    <div>
      <div>
        <button onClick={() => { tabSignal.value = 'posts'; }}>Posts Tab</button>
        <button onClick={() => { tabSignal.value = 'todos'; }}>Todos Tab</button>
        <button onClick={() => { userIdSignal.value += 1; }}>Next User</button>
      </div>

      <hr />
      <h4>Current Tab: {tab}</h4>

      {loading && <p>Fetching network data...</p>}
      {error && <p style={{ color: 'red' }}>An error occurred: {error.message}</p>}
      {data && <pre>{JSON.stringify(data.slice(0, 3), null, 2)}</pre>}
    </div>
  );
};
```

### 2. Optimizing State Updates with Batching

When you need to update multiple related signals at once, wrap them in the `batch` method. Instead of causing two independent network calls and two sequential component re-renders, it executes exactly **one**:

```ts
import { engine, userIdSignal, tabSignal } from './apiStore';

const resetUserToDefault = () => {
  engine.batch(() => {
    userIdSignal.value = 1;
    tabSignal.value = 'posts';
    // Our userDataResource triggers only once!
  });
};
```

### 3. Caching Requests with Time-To-Live (TTL)

You can apply higher-order utility decorators to cache server responses, preventing unnecessary network spam when users toggle frequently between identical tabs or filters.

```ts
import { engine } from './store';
import { withCache } from './decorators/withCache'; // Your cache utility decorator

const searchSignal = engine.signal('', 'search');

export const cachedSearchResource = engine.resource(
  withCache(
    async (query, abortSignal) => {
      const res = await fetch(`https://example.com{query}`, { signal: abortSignal });
      return res.json();
    },
    { ttl: 30 * 1000 } // Cache is valid for 30 seconds for each unique query
  ),
  searchSignal
);
```

## 📂 Recommended Directory Structure

Since `@pravosleva/reactive-engine` allows you to declare state in pure `.ts` files completely decoupled from React, it gives you maximum architectural flexibility. Here are two proven ways to organize your reactive state:

### Option 1. Traditional (Centralized Store)
Best suited for small-to-medium applications. All signals, computed properties, and resources are grouped by business logic in a central `store/` directory.

```text
src/
├── decorators/          # Custom decorators (e.g., withCache.ts)
├── store/               # Global reactive application state
│   ├── index.ts         # Engine initialization (new ReactiveEngine())
│   ├── auth.store.ts    # Authentication, tokens, and permissions state
│   └── products.store.ts# Catalog, shopping cart, and API resource states
├── components/          # Shared UI components (consuming useReactiveValue)
└── App.tsx
```

### Option 2. Feature-Driven Development / FSD (Decentralized State)
Ideal for large-scale applications and monorepos. The reactive state is sliced by domain layers and isolated within specific Features or Entities inside their own `model` modules.

```text
src/
├── app/                 # Application initialization & global ReactiveEngine
│   └── store.ts         # Exports the single shared engine instance
├── features/            # Interactive user features
│   ├── auth-by-username/
│   │   ├── model/       # Isolated feature-specific state
│   │   │   └── login.store.ts # Input signals, validation errors
│   │   └── ui/          # Auth form components
│   └── product-catalog/
│       ├── model/       # Pagination, filtering, and sorting resources
│       │   └── catalog.store.ts
│       └── ui/          # Product grid and filters
```

### 3. Side Effects and Reactions via `useReactiveSubscription`

Sometimes you need to simply **react** to a signal change (e.g., trigger an animation, show a notification, or send a metric to your analytics provider) **without re-rendering the component itself**. This is where the subscription hook shines.

#### Simple Example: Change Logging
The component below will not trigger any React re-renders when clicked, yet the subscription callback runs perfectly on every signal update.

```tsx
import React from 'react';
import { useReactiveSubscription } from '@pravosleva/reactive-engine';
import { counterSignal } from './store';

export const LoggerButton = () => {
  // Decoupled from the React render loop. It just runs the callback when the signal updates.
  useReactiveSubscription(counterSignal, (newValue) => {
    console.log(`[Feedback] Counter mutated to: ${newValue}`);
  });

  return (
    <button onClick={() => counterSignal.value++}>
      Click Me (No re-renders, but check your console!)
    </button>
  );
};
```

#### Advanced Example: Synchronizing with Imperative Browser APIs
This hook is perfect for gluing your reactive state to third-party libraries, HTML5 `<canvas>`, maps, or native browser APIs (such as media players, toast managers, or `localStorage`).

```ts
// store.ts
export const isMutedSignal = engine.signal(false, 'isMuted');
```

```tsx
// AudioPlayer.tsx
import React, { useRef } from 'react';
import { useReactiveSubscription } from '@pravosleva/reactive-engine';
import { isMutedSignal } from './store';

export const AudioPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Seamlessly sync reactive state into an imperative native DOM node property
  useReactiveSubscription(isMutedSignal, (isMuted) => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  });

  return (
    <div>
      <video ref={videoRef} src="video.mp4" controls />
      <button onClick={() => { isMutedSignal.value = !isMutedSignal.value; }}>
        Toggle Mute State
      </button>
    </div>
  );
};
```

## ⚠️ Troubleshooting & Gotchas

Because `@pravosleva/reactive-engine` relies on runtime dependency tracking via JavaScript Proxy and Signals, there are a few architectural rules you should follow to avoid hidden bugs:

### 1. Destructuring Loss
Objects created via `engine.reactive()` are native JavaScript Proxies. The engine intercepts property getters to subscribe components or effects to updates.
* **What NOT to do:** Destructure a proxy object at the top of a component or effect.
  ```ts
  const user = engine.reactive({ name: 'Ivan', age: 30 });
  const { name } = user; // ❌ REACTIVITY LOST! The `name` variable is disconnected from the Proxy.
  ```
* **What to do instead:** Access properties directly where they are evaluated (e.g., inside your JSX or effect block): `user.name`.

### 2. Infinite Update Loops
Reading and mutating the exact same signal inside an `engine.effect` or `engine.computed` simultaneously will trigger an endless update loop, causing a "Maximum call stack size exceeded" crash.
* **Solution:** Wrap the mutational update inside the built-in `engine.untrack()` helper to isolate the dependency tracking tracker:
  ```ts
  engine.effect(() => {
    const current = counterSignal.value; // Read and subscribe safely
    engine.untrack(() => {
      counterSignal.value = current + 1; // ✅ Safe mutation without infinite loops
    });
  });
  ```

### 3. Memory Leaks Outside the React Tree
While React hooks like `useReactiveValue` clean up after themselves automatically, manually invoking `engine.effect()` inside long-lived standalone vanilla services or singletons registers a strong reference in the engine's memory.
* **Solution:** Always capture the returned destructor and call it when the parent service gets destroyed:
  ```ts
  const unsubscribe = engine.effect(() => { ... });
  // Call this when cleaning up the module:
  unsubscribe();
  ```

### 4. Complex Objects as `withCache` Dependencies
The `withCache` utility decorator serializes the `source` arguments using `JSON.stringify()` to form unique cache keys.
* **Limitation:** Avoid passing objects with circular references, functions, or complex class instances (like `Map`, `Set`, or `Date`) as resource dependencies. Stick to flat objects, arrays, and primitives.

---

## 🗂️ License

MIT © Pravosleva
