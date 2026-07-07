# 🚀 ReactiveEngine Core Framework
A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.

## Instruction
- 🇬🇧 [In English](https://github.com/garage-13/reactive-engine/blob/main/README_EN.md)
- 🇷🇺 [In Russian](https://github.com/garage-13/reactive-engine/blob/main/README_RU.md)

## 📦 Installation

Install the package via your favorite package manager:

```bash
npm install @pravosleva/reactive-engine
# or
yarn add @pravosleva/reactive-engine
# or
pnpm add @pravosleva/reactive-engine
```

## 🎯 What Problems This Library Solves

When building large-scale React applications, developers constantly run into architectural bottlenecks imposed by built-in state tools. `@pravosleva/reactive-engine` is designed to elegantly solve the following pain points:

1. **Unnecessary Over-Rendering:**
   * *The Problem:* React Context API and traditional immutability-based stores (Redux/Zustand) force all components reading from that state slice to re-render whenever even a single deeply nested property changes.
   * *The Solution:* Fine-grained reactivity. Components micro-subscribe only to the specific primitive signals they display. State mutations update strictly the necessary DOM nodes.

2. **UI Tearing and Lags in React 18+:**
   * *The Problem:* Under React Concurrent Mode, standard external state managers can lead to UI tearing, where different parts of the screen temporarily display asynchronous, mismatching data.
   * *The Solution:* The `useReactiveValue` hook is built on top of native `useSyncExternalStore`. This ensures absolute cross-component synchronization, shielding your interface from glitches and tearing.

3. **Expensive CPU Re-calculations:**
   * *The Problem:* Heavy array filtration, sorting, or data analytics functions trigger re-evaluations on every parent re-render or whenever unrelated props shift.
   * *The Solution:* Lazy `Computed` properties with O(1) computation caching. The logic evaluates *only* when its underlying dependency signals change.

4. **Network Request Flooding (Race Conditions):**
   * *The Problem:* A user rapidly clicking through catalog filters or pagination options spawns cascades of overlapping network requests. An older, slower request might resolve *after* a newer one, overwriting fresh data (Race Condition).
   * *The Solution:* The `Resource` utility automatically orchestrates native `AbortController` instances. Whenever dependency signals change, the previous pending fetch request is instantly cancelled at the browser's system level.

5. **Cascading UI Updates (Render Cascades):**
   * *The Problem:* Updating 3–4 connected state parameters inside a single event handler prompts 3–4 sequential UI update ticks, clogging the Event Loop.
   * *The Solution:* 100% out-of-the-box automatic batching. The engine bundles all consecutive synchronous and asynchronous modifications into a single microtask, triggering exactly 1 final unified re-render.

6. **Memory Leaks in Dynamic Architectures:**
   * *The Problem:* Dynamically instantiating computed properties (e.g., dynamically filtering an active tab) accumulates abandoned reactive effects in memory that continue to listen to global state updates forever.
   * *The Solution:* Built-in memory cleanup and computation memoization inside the core engine. The library hooks automatically trigger `.destroy()` on component unmount, seamlessly purging dead reactive effects from RAM.
