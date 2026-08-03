# 🚀 ReactiveEngine Core Framework
A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.

https://t.me/bash_exp_ru/3393

# @pravosleva/reactive-engine 🚀

A lightweight, ultra-performant, and framework-agnostic reactive engine powered by Signals and transparent dependency tracking, tailored for React and TypeScript applications.

```bash
npm install @pravosleva/reactive-engine
# or
yarn add @pravosleva/reactive-engine
# or
pnpm add @pravosleva/reactive-engine
```

## 🧱 Built-in Dependency Injection (DI Container)

`ReactiveEngine` acts not only as a signal store but also as a full-fledged Dependency Injection container. It allows you to decouple and interconnect reactive services, eliminating the "global singleton" anti-pattern (which is critical for **Next.js / SSR** and isolated unit testing), and facilitates lazy module instantiation.

### How it works

Instead of tight coupling via hardcoded file `import` statements, services declare their parameters declaratively by requesting them directly from the engine.

```ts
// 1. Declare an authentication service with a reactive signal
export class AuthService {
  public isAuthorized: Signal<boolean>

  constructor(private engine: ReactiveEngine) {
    this.isAuthorized = this.engine.signal(false)
  }
}

// 2. Declare a shopping cart service that depends on the authentication service
export class CartService {
  private authService: AuthService
  public cartResource: Resource<unknown, unknown> // Типизируйте

  constructor(private engine: ReactiveEngine) {
    // Inject the dependency lazily out of the box!
    this.authService = this.engine.inject(AuthService);

    // The async resource automatically syncs with the external authorization state
    this.cartResource = this.engine.resource(
      async (isAuthorized, abortSignal) => {
        if (!isAuthorized) throw new Error('Пользователь еще не авторизован...');
        const res = await fetch('/api/cart', { signal: abortSignal });
        return res.json();
      },
      this.authService.isAuthorized // Resource tracks a signal from another service
    );
  }
}
```

### Registration and Resolution

You can register dependencies as plain values, classes, or custom factory functions. The core container caches resolved instances automatically upon the very first resolution invocation.

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { AuthService, CartService } from './services'

const engine = new ReactiveEngine()

// Register factories (they will be evaluated lazily on demand)
engine.provide(AuthService, (eng) => new AuthService(eng))
engine.provide(CartService, (eng) => new CartService(eng))

// Anywhere in your application or React hook:
const cartService = engine.inject(CartService)
// The engine recognizes that CartService requires AuthService,
// instantiates AuthService, provisions CartService, hooks them together, and returns the singleton.
```

---

## 🎯 What Problems This Library Solves

When building large-scale React applications, developers constantly run into architectural bottlenecks imposed by built-in state tools. `@pravosleva/reactive-engine` is designed to elegantly solve the following pain points:

1. **Unnecessary Over-Rendering:**
> * *The Problem:* React Context API and traditional immutability-based stores (Redux/Zustand) force all components reading from that state slice to re-render whenever even a single deeply nested property changes.
> * *The Solution:* Fine-grained reactivity. Components micro-subscribe only to the specific primitive signals they display. State mutations update strictly the necessary DOM nodes.

2. **UI Tearing and Lags in React 18+:**
> * *The Problem:* Under React Concurrent Mode, standard external state managers can lead to UI tearing, where different parts of the screen temporarily display asynchronous, mismatching data.
> * *The Solution:* The `useReactiveValue` hook is built on top of native `useSyncExternalStore`. This ensures absolute cross-component synchronization, shielding your interface from glitches and tearing.

3. **Expensive CPU Re-calculations:**
> * *The Problem:* Heavy array filtration, sorting, or data analytics functions trigger re-evaluations on every parent re-render or whenever unrelated props shift.
> * *The Solution:* Lazy `Computed` properties with O(1) computation caching. The logic evaluates *only* when its underlying dependency signals change.

4. **Network Request Flooding (Race Conditions):**
> * *The Problem:* A user rapidly clicking through catalog filters or pagination options spawns cascades of overlapping network requests. An older, slower request might resolve *after* a newer one, overwriting fresh data (Race Condition).
> * *The Solution:* The `Resource` utility automatically orchestrates native `AbortController` instances. Whenever dependency signals change, the previous pending fetch request is instantly cancelled at the browser's system level.

5. **Cascading UI Updates (Render Cascades):**
> * *The Problem:* Updating 3–4 connected state parameters inside a single event handler prompts 3–4 sequential UI update ticks, clogging the Event Loop.
> * *The Solution:* 100% out-of-the-box automatic batching. The engine bundles all consecutive synchronous and asynchronous modifications into a single microtask, triggering exactly 1 final unified re-render.

6. **Memory Leaks in Dynamic Architectures:**
> * *The Problem:* Dynamically instantiating computed properties (e.g., dynamically filtering an active tab) accumulates abandoned reactive effects in memory that continue to listen to global state updates forever.
> * *The Solution:* Built-in memory cleanup and computation memoization inside the core engine. The library hooks automatically trigger `.destroy()` on component unmount, seamlessly purging dead reactive effects from RAM.

## ⚡ Why is this approach performant?

Unlike traditional State Management in React (via Context API or immutability-based global stores), `@pravosleva/reactive-engine` works on the principle of **fine-grained reactivity**:

* **Minimal Re-renders:** Components subscribe directly to specific primitive signals (`Signal`) or derived values (`Computed`) they render on the screen, rather than the entire state object. Changing a single signal updates *only* the component that actually reads it.
* **O(1) Computations:** `Computed` properties are lazy. They are never recalculated until their underlying dependency signals change.
* **Automatic Batching:** The engine groups multiple signal modifications into "batches" using microtasks. Network resources or heavy effects won't re-trigger 10 times in a row when updating 10 signals within the same synchronous execution block.
* **Smart Asynchrony:** The `resource` tool orchestrates a native `AbortController` out of the box, automatically cancelling stale pending network requests whenever dependencies change.

## 🛠️ Basic Examples

> You can clone this repo and run `yarn && yarn start` for see life local demo.
```bash
git clone https://github.com/garage-13/reactive-engine.git
yarn
yarn start
```

### 1. Initializing the Engine and Signals

You can declare your reactive state in pure TypeScript/JavaScript files completely outside the React component tree.

```ts
// store.ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'

export const engine = new ReactiveEngine()

// Simple observable state (Signal)
export const counterSignal = engine.signal(0, 'counter')

// Derived state (Computed)
export const doubleComputed = engine.computed(
  () => counterSignal.value * 2,
  'double_counter'
)
```

### 2. Consuming State in React Components

For React 18+, use the high-performance `useReactiveValue` hook (backed by `useSyncExternalStore`). For older React versions (16.8+), use the fallback `useReactiveValue0` hook.

```tsx
// Counter.tsx
import React from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { counterSignal, doubleComputed } from '~/store'

export const Counter = () => {
  // The hook automatically subscribes to changes and triggers a re-render
  const count = useReactiveValue(counterSignal)
  const doubleCount = useReactiveValue(doubleComputed)

  return (
    <div style={{ padding: 20 }}>
      <h3>Counter: {count}</h3>
      <p>Double Value: {doubleCount}</p>

      <button onClick={() => counterSignal.value++}>Increment</button>
      <button onClick={() => counterSignal.value--}>Decrement</button>
    </div>
  )
}
```

## 🔥 Advanced Examples

### 1. Async Resources Dependent on Multiple Signals

If your network request depends on filters, pagination, or a user ID, combine them using a `computed` property. The `resource` utility will automatically track them, trigger fresh fetch logic, and cancel previous requests.

```ts
// apiStore.ts
import { engine } from '~/store'

export const userIdSignal = engine.signal(1, 'userId')
export const tabSignal = engine.signal<'posts' | 'todos'>('posts', 'tab')

// Combine multiple signals into a single derived dependency array
const requestDeps = engine.computed(() => {
  return [userIdSignal.value, tabSignal.value] as const
});

// Create a reactive asynchronous resource
export const userDataResource = engine.resource(
  async ([userId, tab], abortSignal) => {
    const res = await fetch(`https://typicode.com{userId}/${tab}`, {
      signal: abortSignal, // Pass the native cancellation token
    })
    if (!res.ok) throw new Error('Failed to fetch data')
    return res.json()
  },
  requestDeps, // Pass dependencies here
  'userData'
)
```

Consuming this in a component remains clean and fully declarative:

```tsx
// UserProfile.tsx
import React from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { userIdSignal, tabSignal, userDataResource } from './apiStore'

export const UserProfile = () => {
  // Read the resource state object: { data, loading, error }
  const { data, loading, error } = useReactiveValue(userDataResource)
  const tab = useReactiveValue(tabSignal)

  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <button onClick={() => { tabSignal.value = 'posts'; }}>Posts Tab</button>
      <button onClick={() => { tabSignal.value = 'todos'; }}>Todos Tab</button>
      <button onClick={() => { userIdSignal.value += 1; }}>Next User</button>

      <h4>Current Tab: {tab}</h4>

      {loading && <p>Fetching network data...</p>}
      {error && <p style={{ color: 'red' }}>An error occurred: {error.message}</p>}
      {data && <pre>{JSON.stringify(data.slice(0, 3), null, 2)}</pre>}
    </div>
  )
}
```

### 2. Optimizing State Updates with Batching: Automatic Batching (100% Out-of-the-Box Batching)
`@pravosleva/reactive-engine` features **native, built-in automatic batching** powered by microtasks. This means that if you mutate multiple signals consecutively (either synchronously or asynchronously), the engine will automatically consolidate them and trigger **exactly one single re-render** of the React component at the end of the current execution tick. You no longer need to wrap your code in manual `batch()` wrappers.

#### Simple Case: Multiple Synchronous State Updates
In the example below, clicking the button mutates three independent signals consecutively. Thanks to automatic batching, the component will re-render exactly once.

```tsx
import React, { useRef } from 'react'
import { useReactiveValue, ReactiveEngine } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// Define three distinct signals
const firstNameSignal = engine.signal('John')
const lastNameSignal = engine.signal('Doe')
const ageSignal = engine.signal(25)

export const SimpleBatchDemo = () => {
  const firstName = useReactiveValue(firstNameSignal)
  const lastName = useReactiveValue(lastNameSignal)
  const age = useReactiveValue(ageSignal)

  const renderCountRef = useRef(0)
  renderCountRef.current++;

  const handleUpdate = () => {
    // These three synchronous mutations will trigger exactly ONE re-render!
    firstNameSignal.value = 'Peter'
    lastNameSignal.value = 'Smith'
    ageSignal.value = 30
  };

  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <h4>Simple Batching (Profiler)</h4>
      <p>User: {firstName} {lastName}, Age: {age}</p>
      <p style={{ color: 'blue' }}>Component Render Count: {renderCountRef.current}</p>
      <button onClick={handleUpdate}>Update Profile Synchronously</button>
    </div>
  )
}
```

#### Advanced Case: Batching in Asynchronous Flows (Race Condition & API)
Automatic batching works seamlessly even inside asynchronous functions, `setTimeout` blocks, or after `await fetch` resolutions. In this example, once the network request resolves, we update the status, data, and timestamp sequentially, yet React reacts with a single, optimized UI update.

```ts
// store.ts
export const isProcessingSignal = engine.signal(false, 'isProcessing')
export const apiDataSignal = engine.signal<string | null>(null, 'apiData')
export const lastUpdatedSignal = engine.signal<string>('', 'lastUpdated')
```

```tsx
// AdvancedBatchDemo.tsx
import React, { useRef } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { isProcessingSignal, apiDataSignal, lastUpdatedSignal } from '~/store'

export const AdvancedBatchDemo = () => {
  const isProcessing = useReactiveValue(isProcessingSignal)
  const apiData = useReactiveValue(apiDataSignal)
  const lastUpdated = useReactiveValue(lastUpdatedSignal)

  const renderCountRef = useRef(0)
  renderCountRef.current++

  const handleFetchData = async () => {
    isProcessingSignal.value = true; // Mutation 1 (Synchronous re-render to display the loader)

    try {
      // Simulate an asynchronous API request
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const fakeResponse = "Successful server response #42"

      // ASYNCHRONOUS AUTO-BATCHING:
      // These three mutations occur within the same microtask right after the await keyword.
      // The engine batches them together, resulting in exactly 1 final UI re-render!
      apiDataSignal.value = fakeResponse
      lastUpdatedSignal.value = new Date().toLocaleTimeString()
      isProcessingSignal.value = false
    } catch (error) {
      isProcessingSignal.value = false
    }
  };

  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <h4>Advanced Asynchronous Batching</h4>
      <p>Status: {isProcessing ? '⏳ Loading...' : '✅ Ready'}</p>
      <p>Data: {apiData || 'No data available'}</p>
      <p>Last Updated: {lastUpdated || 'Never'}</p>
      <p style={{ color: 'purple' }}>Component Render Count: {renderCountRef.current}</p>
      <button onClick={handleFetchData} disabled={isProcessing}>
        Fetch Data via Network
      </button>
    </div>
  )
}
```

#### Advanced Case: Resetting Multi-Filter State (Heavy Computed Analytics)
This example demonstrates a common frontend task: a `Computed` property executing a heavy filter operation over a large array. When clicking "Reset All", 4 separate signals are mutated sequentially (search, category, price boundary, and sorting). Automatic batching ensures the expensive calculation executes **exactly once** for the final consolidated state.

```ts
// store.ts
export interface Product { id: number; title: string; category: string; price: number; }

export const searchSignal = engine.signal('', 'search')
export const categorySignal = engine.signal('all', 'category')
export const maxPriceSignal = engine.signal(10000, 'maxPrice')
export const sortBySignal = engine.signal<'price' | 'name'>('name', 'sortBy')
export const rawProductsSignal = engine.signal<Product[]>([], 'rawProducts')

// Expensive computation dependent on 5 signals simultaneously
export const filteredProductsComputed = engine.computed(
  () => {
    console.log('🔮 Executing heavy filtering over 10,000 items...')
    let result = [...rawProductsSignal.value]

    if (searchSignal.value) {
      result = result.filter(p => p.title.toLowerCase().includes(searchSignal.value.toLowerCase()))
    }
    if (categorySignal.value !== 'all') {
      result = result.filter(p => p.category === categorySignal.value)
    }
    result = result.filter(p => p.price <= maxPriceSignal.value)

    return result
      .sort((a, b) => sortBySignal.value === 'price'
        ? a.price - b.price
        : a.title.localeCompare(b.title))
  },
  'filteredProducts'
)
```

```tsx
// CatalogDemo.tsx
import React, { useRef } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { searchSignal, categorySignal, maxPriceSignal, sortBySignal, filteredProductsComputed } from '~/store'

export const CatalogDemo = () => {
  const products = useReactiveValue(filteredProductsComputed);

  const renderCountRef = useRef(0);
  renderCountRef.current++;

  const handleResetAllFilters = () => {
    // Mutating 4 signals in a row.
    // Without auto-batching, the heavy filter logic would execute 4 separate times,
    // and the component would re-render at every incomplete intermediate step.
    // With auto-batching: exactly 1 computation and 1 React re-render will occur!
    searchSignal.value = ''
    categorySignal.value = 'all'
    maxPriceSignal.value = 10000
    sortBySignal.value = 'name'
  };

  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <h4>Catalog Filtering (Heavy Analytics)</h4>
      <p>Products found: <b>{products.length}</b></p>
      <p style={{ color: 'green' }}>Component Renders: {renderCountRef.current}</p>
      <button onClick={handleResetAllFilters}>Reset All Filters</button>
    </div>
  )
}
```

### 3. Caching Requests with Time-To-Live (TTL)

You can apply higher-order utility decorators to cache server responses, preventing unnecessary network spam when users toggle frequently between identical tabs or filters.

```ts
import { engine } from '~/store'
import { withCache } from './decorators/withCache' // Your cache utility decorator

const searchSignal = engine.signal('', 'search');

export const cachedSearchResource = engine.resource(
  withCache(
    async (query, abortSignal) => {
      const res = await fetch(`https://example.com{query}`, { signal: abortSignal })
      return res.json()
    },
    { ttl: 30 * 1000 } // Cache is valid for 30 seconds for each unique query
  ),
  searchSignal
)
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
import React from 'react'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'
import { counterSignal } from '~/store'

export const LoggerButton = () => {
  // Decoupled from the React render loop. It just runs the callback when the signal updates.
  useReactiveSubscription(counterSignal, (newValue) => {
    console.log(`[Feedback] Counter mutated to: ${newValue}`)
  });

  return (
    <button onClick={() => counterSignal.value++}>
      Click Me (No re-renders, but check your console!)
    </button>
  )
}
```

#### Advanced Example: Synchronizing with Imperative Browser APIs
This hook is perfect for gluing your reactive state to third-party libraries, HTML5 `<canvas>`, maps, or native browser APIs (such as media players, toast managers, or `localStorage`).

```ts
// store.ts
export const isMutedSignal = engine.signal(false, 'isMuted')
```

```tsx
// AudioPlayer.tsx
import React, { useRef } from 'react'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'
import { isMutedSignal } from '~/store'

export const AudioPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Seamlessly sync reactive state into an imperative native DOM node property
  useReactiveSubscription(isMutedSignal, (isMuted) => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  });

  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <video ref={videoRef} src="video.mp4" controls />
      <button onClick={() => { isMutedSignal.value = !isMutedSignal.value; }}>
        Toggle Mute State
      </button>
    </div>
  )
}
```

### 6. Smart Automated Memory Cleanup (Zero-Config Garbage Collection)

You no longer need to invoke `.destroy()` manually or wrap things in a React `useEffect` to prevent memory leaks when declaring dynamic computed properties (e.g., inside a React `useMemo` hook).

Under the hood, the engine leverages modern JavaScript **`FinalizationRegistry`** API. The moment React unmounts a component or updates dependencies within a `useMemo` block, the previous computation reference is garbage-collected. The core engine detects this event instantly, safely purging orphaned reactive effects and evacuating the internal cache.

#### Example: Bulletproof Inline Computations Without Leaks

```tsx
import React, { useMemo } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { engine, globalProductsSignal } from '~/store'

export const FilteredCatalog = ({ category }: { category: string }) => {
  // Completely safe to consume inside standard useMemo.
  // When 'category' changes, the previous ref is dropped, and the engine automatically wipes its effects from RAM!
  const dynamicComputed = useMemo(() => {
    return engine.computed(() =>
      globalProductsSignal.value.filter(p => p.category === category)
    )
  }, [category]);

  const filteredList = useReactiveValue(dynamicComputed);

  return (
    <ul>
      {filteredList.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  )
}
```

### Transparent Reactivity via `observer` (MobX Style)

If your component renders multiple signals or you prefer to eliminate hook boilerplate from your function bodies, leverage the `observer` High-Order Component (HOC). It automatically tracks which signals or derived computed properties are accessed during the JSX rendering cycle and micro-subscribes the component to those specific state updates.

```tsx
import React from 'react'
import { createObserver } from '@pravosleva/reactive-engine'
import { counterSignal, userSignal, engine } from '~/store'

const observer = createObserver(engine)

// Wrap your component with observer.
// Now you can read `.value` directly inside your JSX—no hooks required!
export const ProfileDashboard = observer(() => {
  return (
    <div style={{ display: 'flex', flexDirecyion: 'column', gap: '8px' }}>
      <h3>User: {userSignal.value.name}</h3>
      <p>Counter Value: {counterSignal.value}</p>

      <button onClick={() => counterSignal.value++}>Increment</button>
      <button onClick={() => { userSignal.value = { name: 'Peter' }; }}>
        Change Name
      </button>
    </div>
  )
})
```

### Another way for render optimization
```tsx
import React, { useRef } from 'react'
import { createObserverComponent } from '@pravosleva/reactive-engine'
import { engine } from '~/store'

// Instantiate the inline observer container component
const Observer = createObserverComponent(engine)

// A rapidly changing signal (e.g., streaming over WebSockets)
const livePriceSignal = engine.signal(100)

export const MassiveDashboard = () => {
  // Counter to track the parent component rendering cycles
  const totalDashboardRenders = useRef(0)
  totalDashboardRenders.current++

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc' }}>
      <h2>📊 Heavy Analytics Dashboard</h2>
      <p>Total Dashboard Page Renders: {totalDashboardRenders.current}</p>

      {/*
        Expensive static layout or complex nested DOM architecture.
        Thanks to the inline <Observer>, this whole block will NEVER
        be re-evaluated when the price fluctuates!
      */}
      <div className="heavy-charts-and-tables">
        <p>...10 heavy charting libraries and analytical tables render here...</p>
      </div>

      {/*
        FINE-GRAINED INLINE REACTIVITY:
        We isolate the signal consumer within the <Observer> container.
        When livePriceSignal.value updates, ONLY the anonymous function
        inside <Observer> triggers a micro-render, saving 99% of CPU runtime!
      */}
      <Observer>
        {() => {
          const innerCounter = useRef(0);
          innerCounter.current++;
          return (
            <div style={{ background: '#f9f9f9', padding: '10px' }}>
              <h3>📈 Live Ticker Price: (Current: ${livePriceSignal.value})</h3>
              <p style={{ color: 'green' }}>
                Micro-zone Isolated Renders: {innerCounter.current}
              </p>
            </div>
          );
        }}
      </Observer>

      <button onClick={() => { livePriceSignal.value += 5; }}>
        Simulate Price Tick (+5$)
      </button>
    </div>
  )
}
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

### 2. Complex Objects as `withCache` Dependencies
The `withCache` utility decorator serializes the `source` arguments using `JSON.stringify()` to form unique cache keys.
* **Limitation:** Avoid passing objects with circular references, functions, or complex class instances (like `Map`, `Set`, or `Date`) as resource dependencies. Stick to flat objects, arrays, and primitives.

### 3. How to enforce it so that you CANNOT FORGET to call `inject`? (Ideal DX)
To save developers from the friction of manually writing two lines of boilerplate (`inject` + `useReactiveValue`) inside every single component, it is highly recommended to design custom hooks on top of your services. You can encapsulate this repetitive routine into a single concise hook right inside the service or store file. This makes forgetting `inject` physically impossible:
```ts
// Inside your feature or store file (e.g., auth.store.ts):
export const useAuthUsername = () => {
  // The hook itself automatically resolves the instance from the engine and unpacks the signal!
  const authService = engine.inject(AuthService);
  return useSyncExternalStore(
    (cb) => authService.username.subscribe(cb),
    () => authService.username.value
  )
}
```

Consuming this inside a component shrinks down to a single perfect line:
```tsx
export const UserHeader = () => {
  const name = useAuthUsername() // Clean, declarative, and entirely bulletproof!
  return <h1>Hello, {name}!</h1>
}
```

## 🗂️ License

MIT © Pravosleva
