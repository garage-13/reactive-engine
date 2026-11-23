---
layout: doc
prev:
  text: Angular tools
  link: '/en/angular'
next:
  text: 'Quick Start with React 18+'
  link: '/en/guides/quick-start/react'
---

# Quick Start with Angular 20+

The `@pravosleva/reactive-engine/angular` adapter natively bridges the core reactive graph (`signal`, `computed`, `resource`, `reactive`) with **Angular Signals** via the `toAngularSignal` helper.

## Installation

```bash
yarn add @pravosleva/reactive-engine
```

Example: https://github.com/pravosleva/angular-escape-sandbox/blob/master/src/app/components/day-3/step-3/step-3.v3.ts

## Basic Example: Counter & Service

### Step 1. Business Logic in `AbstractService`

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class CounterService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'angular-example:counter')
  public doubled = this.engine.computed(() => this.counter.value * 2, 'angular-example:doubled')

  public inc() {
    this.counter.value += 1
  }
}
```

### Step 2. Integrating with an Angular Component (`toAngularSignal`)

The `toAngularSignal` function returns a standard `Readonly Signal` (`NgSignal`) and automatically unsubscribes upon component destruction using Angular's `DestroyRef`.

```ts
import { Component } from '@angular/core'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { toAngularSignal } from '@pravosleva/reactive-engine/angular'
import { CounterService } from './counter.service'

const engine = new ReactiveEngine()

@Component({
  selector: 'app-counter',
  template: `
    <div>
      <h3>Angular 20+ Signals + Reactive Engine</h3>
      <p>Counter: <strong>{{ counter() }}</strong> (x2: {{ doubled() }})</p>
      <button type="button" (click)="logic.inc()">+ INC</button>
    </div>
  `,
})
export class CounterComponent {
  public readonly logic = engine.inject(CounterService)

  // Automatically cleaned up via the component's injection context DestroyRef
  public readonly counter = toAngularSignal(this.logic.counter)
  public readonly doubled = toAngularSignal(this.logic.doubled)
}
```

## Working with `resource` & Proxy Collections (`reactive`)

`toAngularSignal` supports all core primitives, including async resources and deep Proxy collections (`engine.reactive()`):

```ts
import { Component, DestroyRef, inject } from '@angular/core'
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'
import { toAngularSignal } from '@pravosleva/reactive-engine/angular'

class TodosService extends AbstractService {
  public items = this.engine.reactive<string[]>(['Learn core primitives'], 'angular:todos')

  public addTodo(title: string) {
    // In-place .push() mutations automatically trigger Angular Signal updates
    this.items.push(title)
  }
}

const engine = new ReactiveEngine()

@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    <ul>
      @for (item of todos(); track $index) {
        <li>{{ item }}</li>
      }
    </ul>
  `,
})
export class TodosComponent {
  private readonly destroyRef = inject(DestroyRef)
  private readonly service = engine.inject(TodosService)

  // When called outside class fields or constructor, pass DestroyRef as the second argument
  public readonly todos = toAngularSignal(this.service.items, this.destroyRef)
}
```

## SSR & API Data Hydration (`TransferState` + `isPlatformServer`)

In Angular SSR, never store `const engine = new ReactiveEngine()` in a module-level variable—on a Node.js server, doing so leaks state across concurrent requests from different users.

The recommended Angular SSR pattern consists of three steps:
1. **Per-request isolation via Angular DI (`providers: [ReactiveEngine]`):** Register `ReactiveEngine` in the `providers` array of your root or route component. Angular automatically instantiates a dedicated engine per server HTTP request.
2. **Serialization via `TransferState`:** On the server (`isPlatformServer`), the service fetches API data and stores the snapshot in `TransferState` under a `makeStateKey(...)` key.
3. **Instant client hydration:** In the browser, the component checks `transferState.hasKey(KEY)`, hydrates the signal without a duplicate HTTP request, and removes the consumed key (`transferState.remove(KEY)`).

### Step 1. Service with Hydration Support (`article.service.ts`)

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export interface ArticleDto {
  id: string
  title: string
  content: string
}

export class ArticleService extends AbstractService {
  public article = this.engine.signal<ArticleDto | null>(null, 'ng-ssr:article')
  public isLoading = this.engine.signal(false, 'ng-ssr:isLoading')
  public error = this.engine.signal<string | null>(null, 'ng-ssr:error')

  public async loadArticle(id: string): Promise<ArticleDto | null> {
    this.isLoading.value = true
    this.error.value = null

    try {
      const res = await fetch(`https://example.com/api/articles/${encodeURIComponent(id)}`)
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

### Step 2. SSR Component with `TransferState` (`article-page.component.ts`)

```ts
import {
  Component,
  PLATFORM_ID,
  TransferState,
  effect,
  inject,
  input,
  makeStateKey,
} from '@angular/core'
import { isPlatformServer } from '@angular/common'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { toAngularSignal } from '@pravosleva/reactive-engine/angular'
import { ArticleService, type ArticleDto } from './article.service'

const ARTICLE_STATE_KEY = makeStateKey<ArticleDto | null>('ssr:article')

@Component({
  selector: 'app-article-page',
  providers: [
    {
      provide: ReactiveEngine,
      useFactory: () => {
        const engine = new ReactiveEngine()
        inject(DestroyRef).onDestroy(() => engine.dispose())
        return engine
      },
    },
  ],
  template: `
    <div>
      @if (isLoading() && !article()) {
        <p>Loading article...</p>
      } @else if (error()) {
        <p>Error: {{ error() }}</p>
      } @else if (article(); as data) {
        <article>
          <h1>{{ data.title }}</h1>
          <p>{{ data.content }}</p>
        </article>
      }
    </div>
  `,
})
export class ArticlePageComponent {
  // Signal input (standard in Angular 20+)
  public readonly articleId = input.required<string>()

  private readonly engine = inject(ReactiveEngine)
  private readonly transferState = inject(TransferState)
  private readonly platformId = inject(PLATFORM_ID)
  private readonly service = this.engine.inject(ArticleService)

  public readonly article = toAngularSignal(this.service.article)
  public readonly isLoading = toAngularSignal(this.service.isLoading)
  public readonly error = toAngularSignal(this.service.error)

  private readonly syncArticleEffect = effect(() => {
    const id = this.articleId()
    void this.resolveArticle(id)
  })

  private async resolveArticle(id: string) {
    // 1. On the client: if the server serialized a snapshot in TransferState, hydrate without fetching
    if (this.transferState.hasKey(ARTICLE_STATE_KEY)) {
      const snapshot = this.transferState.get(ARTICLE_STATE_KEY, null)
      this.transferState.remove(ARTICLE_STATE_KEY)
      this.service.hydrate(snapshot)
      return
    }

    // 2. On the server (or when articleId changes on the client): fetch data from the API
    const loaded = await this.service.loadArticle(id)

    // 3. On the server, persist the result into TransferState for HTML serialization
    if (isPlatformServer(this.platformId)) {
      this.transferState.set(ARTICLE_STATE_KEY, loaded)
    }
  }
}
```

## Adapter Key Highlights

* **Protection against accidental template mutations:** `toAngularSignal` returns a read-only signal (`.asReadonly()`), ensuring state mutations happen strictly through service methods.
* **`DestroyRef` context handling:** When invoked in class field initializers or inside a `constructor`, subscription cleanup is registered automatically via `inject(DestroyRef)`. If called inside a lifecycle method (such as `ngOnInit`), pass `DestroyRef` explicitly as the second argument to prevent memory leaks.
