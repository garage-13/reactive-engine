---
layout: doc
prev:
  text: Quick Start with React 18+
  link: '/en/guides/quick-start/react'
next:
  text: Quick Start with Vanilla JS & DOM
  link: '/en/guides/quick-start/vanilla'
---

# Quick Start with Vue 3.2+

The `@pravosleva/reactive-engine/vue` adapter connects the core reactive graph to Vue 3's reactivity system via the extended `ReactiveEngine` (`engine.use(...)`) or the `useReactiveValue(...)` composable. It returns a strictly typed `ShallowRef<T>` and automatically unsubscribes on component unmount via `onScopeDispose`.

## Installation

```bash
yarn add @pravosleva/reactive-engine
```

## Basic Example: Counter

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/vue'

class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'vue-example:counter')
  public doubled = this.engine.computed(() => this.counter.value * 2, 'vue-example:doubled')

  public inc = () => {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()
const logic = engine.inject(CounterLogic)

// Returns ShallowRef<number>, automatically cleaned up via onScopeDispose
const counter = engine.use(logic.counter)
const doubled = engine.use(logic.doubled)
</script>

<template>
  <div>
    <h3>Vue 3 Signal Example</h3>
    <p>
      Counter: <code>{{ counter }}</code> (x2: <code>{{ doubled }}</code>)
    </p>
    <button type="button" @click="logic.inc">
      + INC
    </button>
  </div>
</template>
```

## Working with Proxy Collections (`reactive`) & `resource`

The adapter tracks deep Proxy arrays and objects (`engine.reactive()`), creating a shallow reference copy on `.push()` / `.splice()` mutations so Vue 3 templates re-render instantaneously without deep double-proxying:

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/vue'

class CartService extends AbstractService {
  public items = this.engine.reactive<string[]>(['Laptop'], 'vue:cart')

  public addItem(name: string) {
    this.items.push(name)
  }
}

const engine = new ReactiveEngine()
const cart = engine.inject(CartService)

// You can use either engine.use(cart.items) or useReactiveValue(cart.items)
const items = useReactiveValue(cart.items)
</script>

<template>
  <div>
    <button type="button" @click="cart.addItem('Monitor')">
      Add Item
    </button>
    <ul>
      <li v-for="(item, idx) in items" :key="idx">
        {{ item }}
      </li>
    </ul>
  </div>
</template>
```

## SSR & API Data Hydration (Nuxt 3 / Nuxt 4)

In Nuxt 3, Nuxt 4, and other Vue 3 SSR frameworks, you must not create `const engine = new ReactiveEngine()` at the top level of a module outside of `setup()` — doing so would cause state leakage across concurrent user requests on the server.

A reliable pattern for Nuxt 3 / 4 combines:
1. **Per-request instance isolation inside `<script setup>` (or a per-request Nuxt plugin).**
2. **A serializable `useState('article:...')` container:** Nuxt automatically serializes it into the HTML payload on the server and restores it on the client.
3. **`onServerPrefetch` (or `useAsyncData`):** Fetches API data during server-side rendering and saves the snapshot into `useState`.

> **Note:** In Nuxt 3 and Nuxt 4, `useRoute()`, `useState()`, and `useAsyncData()` are global auto-imported composables (generated in `.nuxt/imports.d.ts`), so they do not need to be imported manually.

### Step 1. Service with Hydration Support (`ArticleService.ts`)

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export interface ArticleDto {
  id: string
  title: string
  content: string
}

export class ArticleService extends AbstractService {
  public article = this.engine.signal<ArticleDto | null>(null, 'nuxt:article')
  public isLoading = this.engine.signal(false, 'nuxt:isLoading')
  public error = this.engine.signal<string | null>(null, 'nuxt:error')

  public async loadArticle(id: string): Promise<ArticleDto | null> {
    this.isLoading.value = true
    this.error.value = null

    try {
      const res = await fetch(`https://example.com/api/article/${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: ArticleDto = await res.json()
      this.article.value = data
      return data
    } catch (err: unknown) {
      this.error.value = err instanceof Error ? err.message : 'Failed to load article'
      return null
    } finally {
      this.isLoading.value = false
    }
  }

  public hydrate(snapshot: ArticleDto | null) {
    if (snapshot) {
      this.article.value = snapshot
    }
  }
}
```

### Step 2. Nuxt 3 / 4 Page (`pages/articles/[id].vue` or `app/pages/articles/[id].vue`)

```vue
<script setup lang="ts">
import { onServerPrefetch, onMounted } from 'vue'
import { ReactiveEngine } from '@pravosleva/reactive-engine/vue'
import { ArticleService, type ArticleDto } from '~/services/ArticleService'

// useRoute and useState are auto-imported by Nuxt 3 / 4
const route = useRoute()
const articleId = String(route.params.id)

// 1. Create an isolated engine instance scoped strictly to the current render/request
const engine = new ReactiveEngine()
const service = engine.inject(ArticleService)

// 2. Nuxt useState automatically transfers serialized data from server to client
const ssrSnapshot = useState<ArticleDto | null>(`article:${articleId}`, () => null)

// 3. On the client, immediately hydrate the signal from the snapshot before initial render
if (ssrSnapshot.value) {
  service.hydrate(ssrSnapshot.value)
}

// 4. On the server, await the API fetch and store the result in useState
onServerPrefetch(async () => {
  const loaded = await service.loadArticle(articleId)
  ssrSnapshot.value = loaded
})

// 5. On the client, fetch data only during SPA navigation when no snapshot exists yet
onMounted(() => {
  if (service.article.value?.id !== articleId) {
    void service.loadArticle(articleId)
  }
})

// Subscribe the Vue 3 template to service signals
const article = engine.use(service.article)
const isLoading = engine.use(service.isLoading)
const error = engine.use(service.error)
</script>

<template>
  <div>
    <p v-if="isLoading && !article">Loading article...</p>
    <p v-else-if="error">Error: {{ error }}</p>
    <article v-else-if="article">
      <h1>{{ article.title }}</h1>
      <p>{{ article.content }}</p>
    </article>
  </div>
</template>
```

## Adapter Key Highlights

* **`ShallowRef` instead of deep `ref`:** The adapter intentionally returns a `ShallowRef` so Vue 3 does not wrap core state inside a second layer of `Proxy` objects or spend CPU recursively traversing large structures.
* **Automatic cleanup via `onScopeDispose`:** Core subscriptions are removed automatically when the component unmounts or its `effectScope()` stops.
