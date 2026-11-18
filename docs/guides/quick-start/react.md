---
layout: doc
prev:
  text: Быстрый старт с Angular 20+
  link: '/guides/quick-start/angular'
next:
  text: Быстрый старт с Vue 3.2+
  link: '/guides/quick-start/vue'
---

# Быстрый старт с React 18+

Адаптер `@pravosleva/reactive-engine/react` предоставляет расширенный класс `ReactiveEngine` с методом `engine.use(...)` и хук `useReactiveValue` на базе нативного React `useSyncExternalStore`. Он извлекает актуальное значение примитива (`signal`, `computed`, `resource`, `reactive`) и точечно перерисовывает компонент только при его изменении.

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

## Базовый пример: Счётчик

### Шаг 1. Определение логики в виде отдельного сервиса (`Logic.ts`)

Бизнес-логика оформляется в виде независимых сервисов (`AbstractService`), полностью изолированных от JSX и жизненного цикла React.

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

### Шаг 2. Интеграция с React-компонентом (`engine.use` / `useReactiveValue`)

```tsx
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { Logic } from './Logic'

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)

  // Метод engine.use() (или хук useReactiveValue) подписывает компонент на обновления
  const counter = engine.use(logic.counter)
  const doubled = engine.use(logic.doubled)

  return (
    <div>
      <h3>React 18+ Signal Example</h3>
      <p>
        Счётчик: <code>{counter}</code> (x2: <code>{doubled}</code>)
      </p>
      <button type="button" onClick={() => logic.inc()}>
        + INC
      </button>
    </div>
  )
}
```

## Работа с асинхронными ресурсами (`resource`)

Метод `engine.use()` нативно работает с `engine.resource()`, возвращая объект состояния `{ data, loading, error, isRetrying }`:

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
        Следующий пользователь
      </button>

      {loading && <p>Загрузка профиля...</p>}
      {error && <p>Ошибка: {error.message}</p>}
      {data && <p>Имя: <strong>{data.name}</strong></p>}
    </div>
  )
}
```

## SSR и гидратация данных с API (Next.js / Remix)

При серверном рендеринге (SSR) нельзя использовать глобальный синглтон `const engine = new ReactiveEngine()` на уровне модуля — это приведёт к утечке данных между параллельными запросами разных пользователей.

Лучший паттерн для SSR состоит из трёх шагов:
1. **Изоляция на уровне запроса:** На сервере создаётся свежий `new ReactiveEngine()` для каждого HTTP-запроса.
2. **Сериализация снимка (`exportSnapshot`):** Сервис загружает данные по API на сервере, а результат передаётся в клиентский React Context как обычный JSON-снимок.
3. **Мгновенная гидратация без повторного запроса:** Клиентский `EngineProvider` восстанавливает начальное значение сигнала из снимка при первом рендере, исключая повторный `fetch` и скачок индикатора загрузки.

### Шаг 1. Сервис с поддержкой гидратации (`ArticleService.ts`)

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

  // Вызывается на сервере (или при переходе на клиенте, если данных ещё нет)
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

  // Сериализуемый снимок для передачи с сервера на клиент
  public exportSnapshot(): ArticleDto | null {
    return this.article.value
  }

  // Восстановление состояния на клиенте до первого рендера JSX
  public hydrate(initialData: ArticleDto | null) {
    if (initialData) {
      this.article.value = initialData
    }
  }
}
```

### Шаг 2. Изолированный React Context (`EngineProvider.tsx`)

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
  // useState с ленивым инициализатором гарантирует создание строго одного
  // экземпляра ReactiveEngine на каждый клиентский маунт или серверный запрос
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
    throw new Error('useEngine должен вызываться внутри <EngineProvider>')
  }
  return engine
}
```

### Шаг 3. Серверный компонент (Next.js App Router) и клиентский UI

```tsx
// app/articles/[id]/page.tsx (Server Component)
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { ArticleService } from './ArticleService'
import { EngineProvider } from './EngineProvider'
import { ArticleView } from './ArticleView'

export default async function ArticlePage({ params }: { params: { id: string } }) {
  // 1. Создаём изолированный движок строго для текущего HTTP-запроса
  const serverEngine = new ReactiveEngine()
  const articleService = serverEngine.inject(ArticleService)

  // 2. Загружаем данные по API на сервере
  await articleService.loadArticle(params.id)

  // 3. Передаём сериализуемый снимок в клиентский провайдер
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
    // Если статья уже пришла с сервера (SSR) для этого ID — повторный fetch не нужен
    if (article?.id === articleId) return
    void service.loadArticle(articleId)
  }, [articleId, article?.id, service])

  if (isLoading && !article) return <p>Загрузка...</p>
  if (error) return <p>Ошибка: {error}</p>
  if (!article) return null

  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </article>
  )
}
```

## Важные правила использования в React

* **Соблюдайте Rules of Hooks:** Под капотом `engine.use(item)` вызывает `useReactiveValue(item)`, который использует `useSyncExternalStore`. Вызывайте `engine.use()` только на верхнем уровне функционального компонента (не внутри условий `if` или циклов).
* **SSR и изоляция дерева:** Для серверного рендеринга (Next.js / Remix) создавайте `new ReactiveEngine()` на каждый запрос и передавайте его через стандартный React `createContext` / `useContext`.
