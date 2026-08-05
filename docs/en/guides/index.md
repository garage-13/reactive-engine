---
layout: doc
next:
  text: 'Quick start'
  link: '/en/guides/quick-start'
---

# Introduction to Reactive Engine

`@pravosleva/reactive-engine` is an ultra-lightweight, high-performance logical core and state manager designed for modern applications. The engine's architecture is built entirely on the concept of **Signals**, aiming to deliver a predictable data flow with micro-optimizations for UI rendering.

The primary goal of the engine is to completely isolate business logic from the UI framework, reducing component re-renders to an absolute minimum.

## Key Features

* **Instant Atomic Updates:** Components subscribe strictly to specific primitive signals (`Signal`) or computed properties (`Computed`) rather than a monolithic state object. A change in a single signal updates *only* the specific UI components that actually read it.
* **O(1) Computations:** Derived states (`Computed`) are lazy by design. They cache their results and never trigger recalculations until their underlying source signals change.
* **Automatic Batching:** Multiple synchronous state updates are automatically grouped into a single microtask. Network resources or heavy side-effects won't re-trigger 10 times in a row when 10 signals are updated within the same cycle.
* **Smart Asynchrony Control:** The built-in `resource` tool orchestrates an `AbortController` out of the box. Whenever dependencies change, the engine automatically aborts previous pending network requests, effectively preventing race conditions.

## How it Works

The engine implements a unidirectional data flow that is completely decoupled from your UI framework (such as Vue, React, or Svelte):
```
[ UI Action (Click/Input) ] ──> Update Signal
                                      │
                                      ▼
                           [ Compute Computed ]
                                      │
                                      ▼
[ Micro-optimized UI Render ] <── Effect (DOM Mutation)
```

## Architectural Building Blocks

The engine operates using three core primitives:

1. **`Signal<T>`** — The smallest indivisible cell of reactive state (the source of truth).
2. **`Computed<T>`** — A lazy computed value derived from other signals.
3. **`Resource<T, S>`** — A reactive wrapper for asynchronous operations (API fetch requests, long-polling).

## Why not a traditional state manager?

| Traditional Approach | Reactive Engine Approach |
| :--- | :--- |
| Changing a single field re-renders the entire component tree. | Re-renders **only** the specific text node subscribed to the signal. |
| External SDK initialization (e.g., Edna chat) is tightly coupled with the UI. When a page component unmounts, the script reloads, execution context is lost, and initialization tracking logic gets scattered across `useEffect` / `watch` hooks. | External service scripts are connected and orchestrated within an isolated Service. The engine centrally tracks loading states (`loading`, `ready`, `error`) using reactive signals, atomically providing stable access to the third-party API from anywhere in the application, completely independent of UI mounts/unmounts. |
| Complex integration of business logic when moving between different frameworks. | Clean, vanilla JS/TS code that can be ported from React to Vue or Node.js in seconds. |
