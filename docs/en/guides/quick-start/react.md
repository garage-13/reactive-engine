---
layout: doc
prev:
  text: Quick Start with Angular 20+
  link: '/en/guides/quick-start/angular'
next:
  text: Quick Start with Vue 3.2+
  link: '/en/guides/quick-start/vue'
---

# Quick Start with React 18+

The `@pravosleva/reactive-engine/react` adapter provides an extended `ReactiveEngine` class featuring the `engine.use(...)` method and the `useReactiveValue` hook built on React's native `useSyncExternalStore`. It extracts the current value of any primitive (`signal`, `computed`, `resource`, `reactive`) and re-renders the component only when that specific value changes.

## Installation

```bash
yarn add @pravosleva/reactive-engine
```

## Basic Example: Counter

### Step 1. Define Business Logic in a Service (`Logic.ts`)

Business logic lives inside standalone `AbstractService` classes, completely decoupled from JSX and React component lifecycles.

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-001:signal:counter')
  public doubled = this.engine.computed(() => this.counter.value * 2, 'example-001:computed:doubled')

  public inc() {
    this.counter.value += 1
  }
}
```

### Step 2. Connect to a React Component (`engine.use` / `useReactiveValue`)

```tsx
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { Logic } from './Logic'

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)

  // engine.use() (or the useReactiveValue hook) subscribes the component to updates
  const counter = engine.use(logic.counter)
  const doubled = engine.use(logic.doubled)

  return (
    <div>
      <h3>React 18+ Signal Example</h3>
      <p>
        Counter: <code>{counter}</code> (x2: <code>{doubled}</code>)
      </p>
      <button type="button" onClick={() => logic.inc()}>
        + INC
      </button>
    </div>
  )
}
```

## Working with Async Resources (`resource`)

`engine.use()` natively unwraps `engine.resource()`, returning its reactive state snapshot `{ data, loading, error, isRetrying }`:

```tsx
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

interface UserProfile {
  id: number
  name: string
}

class ProfileService extends AbstractService {
  public userId = this.engine.signal<number>(1, 'react:userId')

  public profileResource = this.engine.resource<UserProfile, number>(
    async (id, signal) => {
      const res = await fetch(`https://typicode.com{id}`, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    this.userId,
    'react:profileResource'
  )
}

const engine = new ReactiveEngine()

export const UserProfileView = () => {
  const service = engine.inject(ProfileService)
  const { data, loading, error } = engine.use(service.profileResource)

  return (
    <div>
      <button type="button" onClick={() => { service.userId.value += 1 }}>
        Next User
      </button>

      {loading && <p>Loading profile...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <p>Name: <strong>{data.name}</strong></p>}
    </div>
  )
}
```

## SSR & API Data Hydration (Next.js / Remix)

In Server-Side Rendering (SSR), never share a module-level singleton `const engine = new ReactiveEngine()`—doing so leaks state across concurrent HTTP requests from different users.

The recommended SSR pattern consists of three steps:
1. **Per-request isolation:** Instantiate a fresh `new ReactiveEngine()` for each incoming server request.
2. **Snapshot serialization (`exportSnapshot`):** Fetch API data on the server and pass the resulting plain JSON snapshot into a client React Context provider.
3. **Instant hydration without duplicate fetches:** The client `EngineProvider` hydrates the initial signal value before the first render, avoiding a redundant `fetch` or loading spinner flash.

### Step 1. Service with Hydration Support (`ArticleService.ts`)

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export interface ArticleDto {
  id: string
  title: string
  content: string
}

export class ArticleService extends AbstractService {
  public article = this.engine.signal<ArticleDto | null>(null, 'ssr:article')
  public isLoading = this.engine.signal(false, 'ssr:isLoading')
  public error = this.engine.signal<string | null>(null, 'ssr:error')

  // Invoked on the server (or during client navigation when data is not yet cached)
  public async loadArticle(id: string): Promise<ArticleDto | null> {
    this.isLoading.value = true
    this.error.value = null

    try {
      const res = await fetch(`https://example.com{encodeURIComponent(id)}`)
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

  // Serializable snapshot passed from server to client
  public exportSnapshot(): ArticleDto | null {
    return this.article.value
  }

  // Restores initial state on the client prior to the first JSX render
  public hydrate(initialData: ArticleDto | null) {
    if (initialData) {
      this.article.value = initialData
    }
  }
}
```

### Step 2. Isolated React Context (`EngineProvider.tsx`)

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { ArticleService, type ArticleDto } from './ArticleService'

const EngineContext = createContext<ReactiveEngine | null>(null)

interface EngineProviderProps {
  initialArticle?: ArticleDto | null
  children: ReactNode
}

export const EngineProvider = ({ initialArticle = null, children }: EngineProviderProps) => {
  // Lazy useState initializer guarantees exactly one ReactiveEngine instance
  // per server request or client mount
  const [engine] = useState(() => {
    const instance = new ReactiveEngine()
    instance.inject(ArticleService).hydrate(initialArticle)
    return instance
  })

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
}

export const useEngine = (): ReactiveEngine => {
  const engine = useContext(EngineContext)
  if (!engine) {
    throw new Error('useEngine must be used within an <EngineProvider>')
  }
  return engine
}
```

### Step 3. Server Component (Next.js App Router) & Client View

```tsx
// app/articles/[id]/page.tsx (Server Component)
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { ArticleService } from './ArticleService'
import { EngineProvider } from './EngineProvider'
import { ArticleView } from './ArticleView'

export default async function ArticlePage({ params }: { params: { id: string } }) {
  // 1. Create an isolated engine scoped strictly to this HTTP request
  const serverEngine = new ReactiveEngine()
  const articleService = serverEngine.inject(ArticleService)

  // 2. Fetch API data on the server
  await articleService.loadArticle(params.id)

  // 3. Pass the serializable snapshot down to the client provider
  return (
    <EngineProvider initialArticle={articleService.exportSnapshot()}>
      <ArticleView articleId={params.id} />
    </EngineProvider>
  )
}
```

```tsx
// ArticleView.tsx (Client Component)
'use client'

import { useEffect } from 'react'
import { useEngine } from './EngineProvider'
import { ArticleService } from './ArticleService'

export const ArticleView = ({ articleId }: { articleId: string }) => {
  const engine = useEngine()
  const service = engine.inject(ArticleService)

  const article = engine.use(service.article)
  const isLoading = engine.use(service.isLoading)
  const error = engine.use(service.error)

  useEffect(() => {
    // Skip client fetch if the matching article was already hydrated via SSR
    if (article?.id === articleId) return
    void service.loadArticle(articleId)
  }, [articleId, article?.id, service])

  if (isLoading && !article) return <p>Loading...</p>
  if (error) return <p>Error: {error}</p>
  if (!article) return null

  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </article>
  )
}
```

## React Usage Rules

* **Follow the Rules of Hooks:** Under the hood, `engine.use(item)` invokes `useReactiveValue(item)`, which calls `useSyncExternalStore`. Always call `engine.use()` at the top level of your functional component (never inside `if` branches or loops).
* **SSR & Tree Isolation:** For server-side rendering (Next.js / Remix), instantiate `new ReactiveEngine()` per request and provide it via React `createContext` / `useContext`.
