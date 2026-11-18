---
layout: doc
prev:
  text: Быстрый старт с React 18+
  link: '/guides/quick-start/react'
next:
  text: Быстрый старт с Vanilla JS и DOM
  link: '/guides/quick-start/vanilla'
---

# Быстрый старт с Vue 3.2+

Адаптер `@pravosleva/reactive-engine/vue` связывает граф ядра с реактивной системой Vue 3 через расширенный `ReactiveEngine` (`engine.use(...)`) или функцию `useReactiveValue(...)`. Адаптер возвращает строго типизированный `ShallowRef<T>` и автоматически отписывается при размонтировании компонента через `onScopeDispose`.

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

## Базовый пример: Счётчик

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

// Возвращает ShallowRef<number>, автоматически очищаемый через onScopeDispose
const counter = engine.use(logic.counter)
const doubled = engine.use(logic.doubled)
</script>

<template>
  <div>
    <h3>Vue 3 Signal Example</h3>
    <p>
      Счётчик: <code>{{ counter }}</code> (x2: <code>{{ doubled }}</code>)
    </p>
    <button type="button" @click="logic.inc">
      + INC
    </button>
  </div>
</template>
```

## Работа с Proxy-коллекциями (`reactive`) и `resource`

Адаптер корректно отслеживает глубокие Proxy-массивы и объекты (`engine.reactive()`), создавая поверхностную копию ссылки при мутациях `.push()` / `.splice()`, чтобы шаблон Vue 3 мгновенно перерисовывался без глубокого проксирования:

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/vue'

class CartService extends AbstractService {
  public items = this.engine.reactive<string[]>(['Ноутбук'], 'vue:cart')

  public addItem(name: string) {
    this.items.push(name)
  }
}

const engine = new ReactiveEngine()
const cart = engine.inject(CartService)

// Можно использовать как engine.use(cart.items), так и функцию useReactiveValue(cart.items)
const items = useReactiveValue(cart.items)
</script>

<template>
  <div>
    <button type="button" @click="cart.addItem('Монитор')">
      Добавить товар
    </button>
    <ul>
      <li v-for="(item, idx) in items" :key="idx">
        {{ item }}
      </li>
    </ul>
  </div>
</template>
```

## SSR и гидратация данных с API (Nuxt 3 `onServerPrefetch` + `useState`)

В Nuxt 3 и других SSR-фреймворках на базе Vue 3 нельзя создавать `const engine = new ReactiveEngine()` на верхнем уровне модуля за пределами `setup()` — это приведёт к пересечению данных между запросами разных пользователей на сервере.

Лучший паттерн для Nuxt 3 объединяет:
1. **Изоляцию инстанса внутри `<script setup>` (или Nuxt-плагина на каждый запрос).**
2. **Сериализуемый контейнер `useState('ssr:article')`:** Nuxt автоматически сериализует его в HTML на сервере (`window.__NUXT__`) и восстанавливает на клиенте.
3. **`onServerPrefetch`:** Выполняет загрузку данных по API во время серверного рендера и записывает снимок в `useState`.

### Шаг 1. Сервис с поддержкой гидратации (`ArticleService.ts`)

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

### Шаг 2. Страница Nuxt 3 (`pages/articles/[id].vue`)

```vue
<script setup lang="ts">
import { onServerPrefetch, onMounted } from 'vue'
import { ReactiveEngine } from '@pravosleva/reactive-engine/vue'
import { ArticleService, type ArticleDto } from '~/services/ArticleService'

const route = useRoute()
const articleId = String(route.params.id)

// 1. Создаём изолированный экземпляр ядра строго для текущего рендера/запроса
const engine = new ReactiveEngine()
const service = engine.inject(ArticleService)

// 2. Контейнер Nuxt useState автоматически переносит данные с сервера на клиент
const ssrSnapshot = useState<ArticleDto | null>(`article:${articleId}`, () => null)

// 3. На клиенте мгновенно гидратируем сигнал из снимка до первого рендера шаблона
if (ssrSnapshot.value) {
  service.hydrate(ssrSnapshot.value)
}

// 4. На сервере дожидаемся загрузки по API и сохраняем результат в useState
onServerPrefetch(async () => {
  const loaded = await service.loadArticle(articleId)
  ssrSnapshot.value = loaded
})

// 5. На клиенте догружаем данные только при SPA-переходе, если снимка ещё нет
onMounted(() => {
  if (service.article.value?.id !== articleId) {
    void service.loadArticle(articleId)
  }
})

// Подписываем шаблон Vue 3 на сигналы сервиса
const article = engine.use(service.article)
const isLoading = engine.use(service.isLoading)
const error = engine.use(service.error)
</script>

<template>
  <div>
    <p v-if="isLoading && !article">Загрузка статьи...</p>
    <p v-else-if="error">Ошибка: {{ error }}</p>
    <article v-else-if="article">
      <h1>{{ article.title }}</h1>
      <p>{{ article.content }}</p>
    </article>
  </div>
</template>
```

## Важные особенности адаптера

* **Использование `ShallowRef` вместо глубокого `ref`:** Адаптер намеренно возвращает `ShallowRef`, чтобы Vue 3 не оборачивал данные из ядра во второй слой собственных `Proxy` и не тратил CPU на рекурсивный обход больших структур.
* **Автоматическая очистка через `onScopeDispose`:** Подписка на ядро удаляется автоматически при уничтожении компонента или закрытии `effectScope()`.
