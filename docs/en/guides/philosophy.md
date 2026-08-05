---
layout: doc
outline: 'deep'
title: 'ReactiveEngine'
description: 'A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.'
head:
  - - meta
    - name: keywords
      content: reactive, signals, javascript
prev: false
next: false
---

# Reactive Engine Philosophy

In the world of modern frontend development, UI frameworks have taken on too many responsibilities. They manage not only the visual rendering but also how our core application state lives, processes, and propagates.

`@pravosleva/reactive-engine` was born out of a strong conviction: **application business logic must be sovereign**. It should not depend on React render cycles, Vue hooks, or Svelte architecture.

## The Three Pillars of Design

### 1. UI is Just a Thin Wrapper (Framework Agnostic)
Your authentication flows, shopping cart calculations, or WebSocket managers should be able to run and be thoroughly tested in a plain terminal using Jest or Vitest—without any browser emulation or DOM mocking.
* **Why it matters:** If your team decides to migrate from React to Vue or Solid tomorrow, you will only rewrite the visual components. The entire core business logic remains completely untouched.

### 2. The Principle of Minimal Awareness
A UI component should only know about the specific state it absolutely needs to render on the screen.
* If a button only needs the string `User: John`, it must not re-render when other properties of the user object (like a `permissions` array) change.
* Fine-grained atomic signals guarantee that updates to the dependency graph happen via precise, point-to-point mutations, entirely bypassing expensive Virtual DOM diffing algorithms.

### 3. Predictability Over Magic
We intentionally avoided implicit Proxy objects that magically track deep mutations behind the scenes. In Reactive Engine, every developer action is explicit:
* You explicitly create a state primitive (`signal`).
* You explicitly declare a derived dependency (`computed`).
* You are fully protected from infinite update loops because the automatic batching mechanism prevents the UI from rendering in the middle of a state transition chain.

## Who is this Engine for?

* **Authors of Complex Interfaces:** Interactive maps, data-dense dashboards with real-time charts, or audio/video players where traditional state updates cause noticeable FPS drops.
* **Long-lived Enterprise Projects:** Where core logic is written to last for years, while UI trends and frameworks shift every few seasons.
* **Performance Perfectionists:** For those who are tired of fighting unexpected re-renders and cluttering code with infinite `useCallback` and `useMemo` hooks.
