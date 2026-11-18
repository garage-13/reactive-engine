# State Management Patterns

This section covers architectural techniques and practical scenarios for designing business logic with **`@pravosleva/reactive-engine` v3.0.1**.

Powered by an intrusive graph (`NodeLink`), object pooling (`LinkPool`), and **O(1)** cursor-based tracking, the engine enables you to build scalable, modular applications with minimal Garbage Collector overhead and zero boilerplate.

## Core Patterns

Start designing your data layer with these foundational approaches:

### 1. [Cross-Service Communication & DI](./cross-service-di)
Splitting an application into isolated domain services (`AbstractService`) and wiring them together via the built-in Dependency Injection container (`this.engine.inject`). Demonstrates how to compose reactive chains across services without global state or memory leaks.

### 2. [Auto-Batching & High-Frequency Updates](./auto-batching)
Leveraging built-in update coalescing via the microtask queue (`queueMicrotask`). Explains how the engine merges multiple synchronous mutations into a single graph pass and when explicit `engine.batch()` calls are appropriate.

### 3. [Dynamic Dependencies & Link Reuse (`LinkPool`)](./dynamic-dependencies-and-link-pool)
Designing computations with conditional branches (`if / else`). Explains how the engine automatically unsubscribes inactive branches, recycles detached edges via `LinkPool` without GC pressure, and preserves **O(1)** speed using `depsCursor`.

### 4. [Multi-Instance Isolation & Cross-Engine Bridges](./multi-instance-isolation)
Running multiple independent `ReactiveEngine` instances within a single application (microfrontends, isolated plugins, SSR) and setting up explicit synchronization bridges between them via `.subscribe()` or `effect`.

### 5. [Async Resources & Race Condition Protection (`resource`)](./async-resources)
Declarative network request management via `engine.resource()`: automatic re-execution on dependency updates, cancellation of stale in-flight requests via `AbortController`, pre-flight checks (`validateBeforeFetch`), and payload validation (`responseValidate`).

### 6. [Optimizing Large Reactive Forms via Proxy (`reactive`)](./reactive-forms)
Granular property-level reactivity for large nested forms (`engine.reactive()`) without cloning the entire state tree, paired with synchronous and asynchronous schema validation using `withValidationSync` and `withValidationAsync` decorators.

### 7. [Optimistic UI Updates with Automatic Rollback](./optimistic-ui)
Instant UI feedback on user actions with state snapshot preservation (`previousSnapshot`), race-condition cancellation on rapid clicks (`AbortController`), and automatic rollback on network failures.

### 8. [Request Caching Strategies (`withCache` & `withStaleWhileRevalidate`)](./caching-strategies)
TTL-based response caching with parallel Request Collapsing via `withCache`, and Network-First resilient fallback with LRU memory eviction (`maxSize`) via `withStaleWhileRevalidate`.

### 9. [Continuous Server Polling & Exponential Backoff (`withLongPolling`)](./long-polling)
Building a resilient Long Polling pipeline on top of `engine.resource()` with session token isolation (`currentSessionToken`), progressive failure backoff, and a dual cancellation circuit (`AbortSignal` + `externalSignal`).

### 10. [Rate Limiting Requests & Computations (`withDebounce`, `withThrottle`, `withThrottleComputed`)](./rate-limiting)
Protecting network and CPU layers against high-frequency input streams: delayed fetching (`withDebounce`), Leading/Trailing network throttling (`withThrottle`), and capped in-memory recomputations (`withThrottleComputed`).

### 11. [WebSockets & Real-Time Data Streams](./websockets)
Encapsulating `WebSocket` connections inside `AbstractService` with automatic batching of incoming message bursts, reactive reconnection via `effect`, exponential backoff on disconnects, and strict type-guarded payload parsing.

### 12. [Socket.IO v4+ Integration (Typed Events, Ack & Connection State Recovery)](./socket-io)
Building a resilient Socket.IO v4+ client inside `AbstractService` with typed `ServerToClientEvents` / `ClientToServerEvents` contracts, dynamic `auth` callbacks, promise-based `emitWithAck`, and `socket.recovered` state handling.

### 13. [Finite State Machines (FSM) with Signals](./state-machines)
Deterministic management of complex multi-step workflows without impossible states, powered by strict TypeScript Discriminated Unions, a `send(event)` transition dispatcher, and automatic cancellation of exit side effects.

## General Architectural Principles

Keep these three rules in mind when structuring state in `@pravosleva/reactive-engine`:

* **Keep `computed` properties pure:** Use `computed` strictly for deriving values without side effects or mutating other signals. Move all side effects, logging, and network calls into `effect` or `resource`.
* **Isolate business logic in services:** Encapsulate signals and state-mutating methods inside `AbstractService` classes. This keeps your domain logic completely decoupled from the UI framework (React, Vue, Angular) and simplifies unit testing.
* **Maintain a predictable read order:** Inside dynamic `computed` callbacks, read shared control flags before `if / else` branches so `depsCursor` always hits the **O(1)** fast path.

::: info Expanding Section
This collection is continuously growing with new production patterns: request caching with TTL support (`withCache`), Optimistic UI updates, and state machine integration.
:::
