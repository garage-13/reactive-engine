# 🚀 ReactiveEngine Core Framework
A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.

https://t.me/bash_exp_ru/3393

```bash
yarn add @pravosleva/reactive-engine
```

## 📦 Core Components
### 1. ReactiveEngine
The central hub of the system. It manages state, effects, DI, and the bridge to React.

- signal<T>(value, options) — Creates an atomic state unit.
- computed<T>(fn) — Derives data with automatic caching.
- reactive<T>(obj) — Provides deep reactivity for objects and arrays via Proxy.
- resource<T>(fetcher, source?) — Handles async requests with auto-abort (Race Condition protection).
- inject<T>(Class) — Retrieves or instantiates a singleton service.
- use(signal) — A React hook to subscribe to reactive updates.
- untrack(fn) — Executes a function without creating reactive dependencies.

### 2. BaseREService
An abstract class for encapsulating business logic.
- Rule: Always initialize signals and resources directly in class fields to ensure correct DI instantiation and type inference.

## 🛠 Quick Start
### Step 1: Initialization (Entry Point)
Create and export a single instance of the engine to be used throughout your app.

Your instance in your local `~/utils/engine.ts`:
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

export const engine = new ReactiveEngine();
// Bridge the engine with React hooks
engine.setReactAdapters(useState, useEffect);
```

### Step 2: Define Business Logic (Service)
Inherit from BaseREService to create a reactive store.
```ts
import { BaseREService, Signal, Computed } from '@pravosleva/reactive-engine';

export class CounterService extends BaseREService {
  // Initialize signals with runtime validation
  public count = this.engine.signal(0, {
    name: 'counter',
    validate: (v) => v >= 0 || "Value cannot be negative"
  });

  // Derived state (auto-updates when count changes)
  public double = this.engine.computed(() => this.count.value * 2);

  increment = () => this.count.value++;
  decrement = () => this.count.value--;
}
```

### Step 3: Use in React Components
Connect your logic to the UI with minimal boilerplate.

```ts
import { engine } from '~/utils/engine';
import { CounterService } from './CounterService';

export const Counter = () => {
  // Get the service singleton via DI
  const store = engine.inject(CounterService);

  // Subscribe to reactive updates
  const count = engine.use(store.count);
  const double = engine.use(store.double);

  return (
    <div>
      <h1>Count: {count} (Double: {double})</h1>
      <button onClick={store.increment}>+</button>
      <button onClick={store.decrement}>-</button>
    </div>
  );
};
```

## ⚡️ Advanced Features
Async Resources
The resource method automatically re-fetches data whenever its source dependency changes.
```ts
this.userProfile = this.engine.resource(
  async (id, signal) => {
    const res = await fetch(`https://example.com/{id}`, { signal });
    if (!res.ok) throw new Error('Not found');
    return res.json();
  },
  this.userId // Re-runs when this signal changes
);
```

### Debugging & Logging
Enable global logging to track every state change in your application:
```ts
engine.onSignalChange = (name, next, prev) => {
  console.log(`%c[${name}]`, 'color: #2196F3; font-weight: bold;', prev, '→', next);
};
```

## ⚠️ Best Practices
- Always Initialize in Fields: Define reactive properties as class fields. Avoid initializing them inside methods to prevent undefined errors during rendering.
- Naming Convention: Provide clear names for signals (e.g., this.engine.signal(0, 'my_signal_name')) for better debugging logs.
- Batching: Use engine.batch(() => { ... }) when updating multiple signals to prevent unnecessary re-renders.
- Untrack: Use engine.untrack(() => signal.value) inside effects if you need to read a value without subscribing to it.

## Possible project structure (for example)
```
src/
├── utils/
│   └── engine.ts                 # ReactiveEngine instance
│
├── services/                     # Business-logic (Store)
│   ├── index.ts                  # DI exports (?)
│   ├── User/
│   │   ├── UserService.ts        # User logic
│   │   └── types.ts              # DTO & data interfaces
│   └── Counter/
│       └── CounterService.ts
│
├── components/                   # UI-layer (React)
│   ├── Shared/                   # Common components
│   └── Features/                 # Components with logic
│       └── UserProfile/
│           ├── UserProfile.tsx   # Usage of engine.use(store.user)
│           └── styles.module.css
│
├── hooks/                        # Global React-hooks
│   └── useStore.ts               # Helpers like useUserStore()
│
└── main.tsx                      # Entry point (settings like engine.setReactAdapters)
```
