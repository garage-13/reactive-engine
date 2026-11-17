# Multi-Instance Isolation & Cross-Engine Bridges

In **`@pravosleva/reactive-engine` v3.0.1**, each instance of `ReactiveEngine` provides an isolated reactive environment with its own dependency tracker and scheduler, preventing global state pollution.

## Core Capabilities

* **Microfrontends & Plugins:** Isolates widget engines from the host application.
* **Server-Side Rendering (SSR):** Prevents request state leakage in concurrent environments.
* **Sandboxes & Testing:** Enables clean instantiation and teardown via `destroy()`.

For comprehensive code examples and full architectural patterns, please consult the official documentation or repository guidelines.

## Cross-Engine Synchronization Bridges

Because `hostEngine` and `widgetEngine` operate in isolation, explicit synchronization bridges are required to connect them, such as direct signal subscriptions using `.subscribe()` or reactive effect bridges using `engine.effect()` [v3.0.1].

## Dynamic Widget Lifecycle & Memory Cleanup

When handling temporary engine instances, ensure proper resource release and bridge teardown upon unmounting (such as in React's `useEffect` cleanup phase). For a detailed comparison of data-layer versus presentation-layer synchronization strategies, please consult the full documentation guidelines.
