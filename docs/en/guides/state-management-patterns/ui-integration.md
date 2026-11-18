# Connecting Services to UI Frameworks (View Layer Integration)

A core architectural principle of **`@pravosleva/reactive-engine` v3.0.1** is the complete decoupling of business logic and the reactive state graph (`signal`, `computed`, `resource`, `AbstractService`) from any specific rendering framework.

The exact same service layer can power **React**, **Vue 3**, **Angular**, or **Vanilla DOM** applications simultaneously without rewriting domain logic or unit tests.

## Unified Integration Blueprint

Regardless of the UI framework you choose, connecting components to the reactive core follows a consistent three-step pattern:

1. **Encapsulate domain logic in `AbstractService`:** Components do not manage complex fetching, caching, or validation workflows—they simply resolve a service instance via `engine.inject(MyService)`.
2. **Fine-grained view subscriptions:** Each UI component subscribes strictly to the signals and computed properties it actually renders (via `useSyncExternalStore` in React, `shallowRef` / adapters in Vue, or `engine.effect` in Vanilla JS).
3. **Command-driven mutations:** User interactions (clicks, text input, form submissions) delegate back to the service by invoking its public methods (`service.submit()`, `service.toggleTodo(id)`).

---

## Framework-Specific Integration Guides

Detailed setup instructions, ready-to-use hooks/composables, and rendering optimization tips for each platform are available in the **Quick Start** guides:

* **[Angular 20+ Integration](/en/guides/quick-start/angular)** — bridging core signals, computed values, and Proxy collections into Angular Signals via `toAngularSignal` with automatic `DestroyRef` cleanup.
* **[React 18+ Integration](/en/guides/quick-start/react)** — subscribing components via `engine.use()` and `useReactiveValue` built on native `useSyncExternalStore` with zero redundant re-renders.
* **[Vue 3.2+ Integration](/en/guides/quick-start/vue)** — binding core primitives to `ShallowRef` via `engine.use()` / `useReactiveValue` with automatic `onScopeDispose` teardown.
* **[Vanilla JS & Direct DOM](/en/guides/quick-start/vanilla)** — wiring `engine.effect()` callbacks and async resources directly to native DOM nodes without a Virtual DOM.

## Architectural Best Practices for the View Layer

* **Provide `ReactiveEngine` via Context or component-tree DI:** Avoid hardcoding components against a global module singleton when building **SSR** apps or rendering multiple isolated widget trees on the same page (see [Multi-Instance Isolation & Cross-Engine Bridges](./multi-instance-isolation)).
* **Avoid mirroring service state in local component state:** When data already lives inside `service.items.value` or `service.form`, avoid copying it into `useState` or local `ref`s unless strictly needed for transient UI state—keep a single source of truth inside your services.
