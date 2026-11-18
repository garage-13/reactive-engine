---
layout: doc
next:
  text: 'Quick start with React'
  link: '/en/guides/quick-start/react'
---

# Introduction to Reactive Engine

`@pravosleva/reactive-engine` is an ultra-lightweight, high-performance logical core and state manager designed for modern applications. The engine's architecture is built entirely on the concept of **Signals**, aiming to deliver a predictable data flow with micro-optimizations for UI rendering.

The primary goal of the engine is to completely isolate business logic from the UI framework, reducing component re-renders to an absolute minimum.

![js-reactivity-benchmark results for @pravosleva/reactive-engine v3.0.2](/js-reactivity-benchmark/2026-11-18/latest-benchmark.png)

::: info How to Interpret Benchmark Tables
Summary tables in `js-reactivity-benchmark` place libraries from two distinct architectural tiers side by side:
* **Low-level reactive primitives** (`alien-signals`, `@preact/signals-core`) — bare-metal signal kernels with minimal object shapes and no built-in DI, debug labels, write validation, or async resource management.
* **Full-featured application state managers** (`@pravosleva/reactive-engine`, `MobX`, `@angular/signals`, `$mol_wire`) — frameworks where every reactive node carries application-level infrastructure: string debug IDs, write-time validation, cascaded effect ownership (`ownedEffects`), dependency injection, and `resource` lifecycles.

**What these measurements actually tell you:**
1. **Abstraction overhead, not feature parity:** In allocation-heavy suites like `s` (creating thousands of empty computations in a tight loop), a minimal primitive will naturally instantiate faster due to fewer fields per node.
2. **Hot-path efficiency:** Staying within **1.08×–1.17×** of bare-metal primitives in dynamic graph workloads (`cellx`, `dynamic`) while outperforming other full-featured state managers proves that high-level features add negligible overhead during signal propagation and edge reconciliation.
:::

## Tree-Shaking & React-Free Core

The package is built with bundle size optimization in mind and features full **tree-shaking** support out of the box. Thanks to strict entry-point separation at the `package.json` level, utilizing the core library (`@pravosleva/reactive-engine`) in Vanilla JS or headless environments is **completely isolated**. All React-specific adapters and dependencies reside exclusively within the `/react` subpath and will never be bundled into your application unless explicitly imported. Furthermore, `react` is marked as an optional peer dependency, ensuring a clean installation without cluttering packet manager logs in non-React environments.

## Key Features

* **Instant Atomic Updates:** Components subscribe strictly to specific primitive signals (`Signal`) or computed properties (`Computed`) rather than a monolithic state object. A change in a single signal updates *only* the specific UI components that actually read it.
* **O(1) Computations:** Derived states (`Computed`) are lazy by design. They cache their results and never trigger recalculations until their underlying source signals change.
* **Automatic Batching:** Multiple synchronous state updates are automatically grouped into a single microtask. Network resources or heavy side-effects won't re-trigger 10 times in a row when 10 signals are updated within the same cycle.
* **Smart Asynchrony Control:** The built-in `resource` tool orchestrates an `AbortController` out of the box. Whenever dependencies change, the engine automatically aborts previous pending network requests, effectively preventing race conditions.

## How it Works

The engine implements a unidirectional data flow that is completely decoupled from your UI framework (such as Vue, React, or Svelte):
```
[ UI Action (Click/Input) ]
↓
Update Signal
↓
[ Compute Computed ]
↓
Effect (DOM Mutation)
↓
[ Micro-optimized UI Render ]
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
