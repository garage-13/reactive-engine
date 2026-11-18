---
layout: doc
prev:
  text: Angular tools
  link: '/angular'
next:
  text: 'Быстрый старт с React 18+'
  link: '/guides/quick-start/react'
---

# Быстрый старт с Angular 20+

Адаптер `@pravosleva/reactive-engine/angular` нативно связывает граф ядра (`signal`, `computed`, `resource`, `reactive`) с системой **Angular Signals** через функцию `toAngularSignal`.

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

Example: https://github.com/pravosleva/angular-escape-sandbox/blob/master/src/app/components/day-3/step-3/step-3.v3.ts

## Базовый пример: Счётчик и сервис

### Шаг 1. Бизнес-логика в `AbstractService`

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

### Шаг 2. Интеграция с Angular-компонентом (`toAngularSignal`)

Функция `toAngularSignal` возвращает стандартный `Readonly Signal` (`NgSignal`) и автоматически отписывается от обновлений при уничтожении компонента через встроенный `DestroyRef`.

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
      <p>Счётчик: <strong>{{ counter() }}</strong> (x2: {{ doubled() }})</p>
      <button type="button" (click)="logic.inc()">+ INC</button>
    </div>
  `,
})
export class CounterComponent {
  public readonly logic = engine.inject(CounterService)

  // Автоматически очищается через DestroyRef контекста инъекций компонента
  public readonly counter = toAngularSignal(this.logic.counter)
  public readonly doubled = toAngularSignal(this.logic.doubled)
}
```

## Работа с `resource` и Proxy (`reactive`)

Адаптер `toAngularSignal` поддерживает все примитивы ядра, включая асинхронные ресурсы и глубокие Proxy-коллекции (`engine.reactive()`):

```ts
import { Component, DestroyRef, inject } from '@angular/core'
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'
import { toAngularSignal } from '@pravosleva/reactive-engine/angular'

class TodosService extends AbstractService {
  public items = this.engine.reactive<string[]>(['Изучить ядро'], 'angular:todos')

  public addTodo(title: string) {
    // Мутация .push() автоматически триггерит обновление Angular Signal
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

  // Если вызов происходит вне конструктора/полей класса, передайте DestroyRef вторым аргументом
  public readonly todos = toAngularSignal(this.service.items, this.destroyRef)
}
```

## SSR и гидратация данных с API (`TransferState` + `isPlatformServer`)

В Angular SSR нельзя хранить `const engine = new ReactiveEngine()` в глобальной переменной модуля — на сервере Node.js это приведёт к пересечению состояния между запросами разных пользователей.

Лучший паттерн для Angular SSR состоит из трёх шагов:
1. **Изоляция через DI Angular (`providers: [ReactiveEngine]`):** Регистрируйте `ReactiveEngine` в массиве `providers` корневого компонента или конкретного маршрута. Angular автоматически создаст отдельный экземпляр движка для каждого HTTP-запроса на сервере.
2. **Сериализация через `TransferState`:** На сервере (`isPlatformServer`) сервис загружает данные по API и записывает снимок в `TransferState` по ключу `makeStateKey(...)`.
3. **Мгновенная гидратация на клиенте:** В браузере компонент проверяет наличие ключа через `transferState.hasKey(KEY)`, восстанавливает сигнал без повторного HTTP-запроса и удаляет использованный ключ (`transferState.remove(KEY)`).

### Шаг 1. Сервис с поддержкой гидратации (`article.service.ts`)

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
      const res = await fetch(`https://example.com{encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: ArticleDto = await res.json()
      this.article.value = data
      return data
    } catch (err: unknown) {
      this.error.value = err instanceof Error ? err.message : 'Ошибка загрузки статьи'
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

### Шаг 2. SSR-компонент с `TransferState` (`article-page.component.ts`)

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
  // Изолированный экземпляр ReactiveEngine на каждый запрос / дерево компонента
  providers: [ReactiveEngine],
  template: `
    <div>
      @if (isLoading() && !article()) {
        <p>Загрузка статьи...</p>
      } @else if (error()) {
        <p>Ошибка: {{ error() }}</p>
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
  // Сигнальный инпут (стандарт Angular 20+)
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
    // 1. На клиенте: если сервер передал снимок в TransferState — гидратируем без fetch
    if (this.transferState.hasKey(ARTICLE_STATE_KEY)) {
      const snapshot = this.transferState.get(ARTICLE_STATE_KEY, null)
      this.transferState.remove(ARTICLE_STATE_KEY)
      this.service.hydrate(snapshot)
      return
    }

    // 2. На сервере (или при смене articleId на клиенте): загружаем данные по API
    const loaded = await this.service.loadArticle(id)

    // 3. На сервере сохраняем результат в TransferState для передачи в HTML
    if (isPlatformServer(this.platformId)) {
      this.transferState.set(ARTICLE_STATE_KEY, loaded)
    }
  }
}
```

## Важные особенности адаптера

* **Защита от случайных мутаций в шаблоне:** `toAngularSignal` возвращает сигнал в режиме только для чтения (`.asReadonly()`), поэтому изменить состояние можно только через методы сервиса.
* **Контекст `DestroyRef`:** При вызове `toAngularSignal` в полях класса или внутри `constructor` очистка подписки регистрируется автоматически через `inject(DestroyRef)`. Если вы создаёте адаптер внутри метода (например, в `ngOnInit`), обязательно передайте `DestroyRef` вторым аргументом, чтобы избежать утечек памяти.
