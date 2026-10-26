---
layout: home

hero:
  title: "🚀 Reactivity Decorators"
  tagline: "A collection of all decorators for the @pravosleva/reactive-engine logical core. Select a decorator to view its guide."

features:
  - icon: 💾
    title: withCache
    details: This decorator allows creating caching data loaders that automatically update subscribed dependencies when the data changes.
    link: /en/decorators/withCache
  - icon: ⏸️
    title: withDebounce
    details: Batches frequent function calls and delays their execution for a specified amount of time. Ideal for search inputs.
    link: /en/decorators/withDebounce
  - icon: 📡
    title: withLongPolling
    details: Automatically manages periodic server requests to update resources in real time.
    link: /en/decorators/withLongPolling
  - icon: 💾
    title: withStaleWhileRevalidate
    details: This decorator implements the "stale-while-revalidate" strategy for data fetching functions. It caches the results of requests and returns stale data from the cache when an error or cancellation occurs during a retry, as long as the TTL (time-to-live) of the cached data is still valid. This helps maintain application continuity and improves performance.
    link: /en/decorators/withStaleWhileRevalidate
  - icon: ⏱️
    title: withThrottle
    details: This decorator is designed to create a throttling data loader that limits the frequency of calls to an asynchronous function `fetcher`. This is useful when integrating with your core resource system to prevent excessive server requests.
    link: /en/decorators/withThrottle
  - icon: 🎛️
    title: withThrottleAndCache
    details: This decorator applies rate limiting (throttling) while preserving the last call and checks cache validity before sending a real network request. This decorator also supports operation cancellation through the standard `AbortSignal`.
    link: /en/decorators/withThrottleAndCache
  - icon: 🛡️
    title: withThrottleComputed
    details: This decorator for creating throttled computed values. Allows grouping and limiting the frequency of heavy computations, protecting the dependency graph and UI from excessive updates ("data chattering").
    link: /en/decorators/withThrottleComputed
  - icon: ✅
    title: withValidation(Sync|Async)
    details: Provides a validation mechanism for synchronous actions and asynchronous fetchers within a reactive system (could be combined with `resource` method). It allows checking the state before executing an action or fetching data, ensuring the correctness of operations.
    link: /en/decorators/withValidation
---
