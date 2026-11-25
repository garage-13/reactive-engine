---
layout: doc
prev:
  text: Quick Start with Vue 3.2+
  link: '/en/guides/quick-start/vue'
next:
  text: State Management Patterns
  link: '/en/guides/state-management-patterns/'
---

# Quick Start with Vanilla JS & Direct DOM

**`@pravosleva/reactive-engine` v3.0.x** requires no UI framework or Virtual DOM. To bind reactive state directly to native DOM nodes, use **`engine.effect()`** (batched reactive side effects) or **`.subscribe()`** (point-to-point subscription on a single signal).

## Installation

```bash
yarn add @pravosleva/reactive-engine
```

## Basic Example: Counter & DOM Binding

### Step 1. Define Business Logic in `AbstractService` (`CounterService.ts`)

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class CounterService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'vanilla:counter')
  public doubled = this.engine.computed(() => this.counter.value * 2, 'vanilla:doubled')

  public inc() {
    this.counter.value += 1
  }

  public reset() {
    this.counter.value = 0
  }
}
```

### Step 2. Bind Effects to DOM Elements (`main.ts`)

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { CounterService } from './CounterService.js'

const engine = new ReactiveEngine()
const logic = engine.inject(CounterService)

const countEl = document.getElementById('count-value')
const doubledEl = document.getElementById('doubled-value')
const incBtn = document.getElementById('btn-inc')
const resetBtn = document.getElementById('btn-reset')

// Reactively update DOM text nodes whenever dependencies change.
// If counter updates multiple times in the same tick, the DOM updates only once.
const stopRenderEffect = engine.effect(() => {
  if (countEl) countEl.textContent = String(logic.counter.value)
  if (doubledEl) doubledEl.textContent = String(logic.doubled.value)
}, 'vanilla:renderCounter')

incBtn?.addEventListener('click', () => logic.inc())
resetBtn?.addEventListener('click', () => logic.reset())

// Clean up the effect subscription when removing the widget from the page
// stopRenderEffect()
```

## Working with Async Resources (`resource`) in Vanilla JS

The `engine.resource()` primitive manages loading states, errors, and automatic `AbortController` cancellation of superseded requests with zero external dependencies:

```ts
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'

interface PostDto {
  id: number
  title: string
}

class PostService extends AbstractService {
  public postId = this.engine.signal<number>(1, 'vanilla:postId')

  public postResource = this.engine.resource<PostDto, number>(
    async (id, abortSignal) => {
      const res = await fetch(`https://typicode.com{id}`, {
        signal: abortSignal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    this.postId,
    'vanilla:postResource'
  )
}

const engine = new ReactiveEngine()
const posts = engine.inject(PostService)

const statusEl = document.getElementById('post-status')
const nextBtn = document.getElementById('btn-next-post')

engine.effect(() => {
  const { loading, data, error } = posts.postResource.value
  if (!statusEl) return

  if (loading) {
    statusEl.textContent = 'Loading post...'
    return
  }
  if (error) {
    statusEl.textContent = `Error: ${error.message}`
    return
  }
  if (data) {
    statusEl.textContent = `#${data.id}: ${data.title}`
  }
})

// Rapid clicks automatically cancel previous in-flight fetch requests
nextBtn?.addEventListener('click', () => {
  posts.postId.value += 1
})
```

## Vanilla JS Best Practices

* **Retain the cleanup function returned by `engine.effect()`:** Calling `engine.effect(...)` returns a `() => void` disposer. Invoke it when tearing down dynamic views (SPA routes, modals) so removed DOM references are not held inside closures.
* **Use `engine.batch()` for grouped synchronous updates in DOM listeners:** While updates inside standard microtasks batch automatically, wrap multiple synchronous signal writes inside a single DOM event handler with `engine.batch(() => { ... })`.
