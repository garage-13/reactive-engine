---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Reactive Engine"
  text: "The logical core of the project"
  tagline: High-performance reactive state management and utils
  actions:
    - theme: brand
      text: Quick start
      link: /en/guides/quick-start
    - theme: alt
      text: Core Description
      link: /en/guides
    - theme: alt
      text: Decorators
      link: /en/decorators

features:
  - title: Minimal Re-renders
    details: Components subscribe strictly to specific primitive signals (`Signal`) or computed properties (`Computed`) rather than the entire state object. A change in a single signal updates *only* the component that actually reads it.
  - title: O(1) Computations
    details: Computed properties are lazy. They are never recalculated until their underlying source signals change.
  - title: Automatic Batching
    details: The engine groups multiple signal updates into single batches via microtasks. Network resources or heavy side-effects won't trigger 10 times in a row when 10 signals are updated within the same cycle.
  - title: Smart Asynchrony
    details: The built-in `resource` tool orchestrates an `AbortController` out of the box, automatically cancelling previous pending network requests whenever dependencies change.
---
