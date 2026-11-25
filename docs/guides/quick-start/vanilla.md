---
layout: doc
prev:
  text: Быстрый старт с Vue 3.2+
  link: '/guides/quick-start/vue'
next:
  text: Паттерны управления состоянием
  link: '/guides/state-management-patterns/'
---

# Быстрый старт с Vanilla JS и DOM

Ядро **`@pravosleva/reactive-engine` v3.0.x** не требует UI-фреймворков или виртуального DOM (Virtual DOM). Для связывания состояния с нативным DOM используются методы **`engine.effect()`** (реактивные побочные эффекты с автобатчингом) и **`.subscribe()`** (точечная подписка на конкретный сигнал).

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

## Базовый пример: Счётчик и привязка к DOM

### Шаг 1. Определение логики в `AbstractService` (`CounterService.ts`)

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

### Шаг 2. Привязка эффектов к DOM-элементам (`main.ts`)

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { CounterService } from './CounterService.js'

const engine = new ReactiveEngine()
const logic = engine.inject(CounterService)

const countEl = document.getElementById('count-value')
const doubledEl = document.getElementById('doubled-value')
const incBtn = document.getElementById('btn-inc')
const resetBtn = document.getElementById('btn-reset')

// Реактивно обновляем текстовые узлы DOM при изменении зависимостей.
// Если counter изменится несколько раз за один тик, DOM обновится только один раз.
const stopRenderEffect = engine.effect(() => {
  if (countEl) countEl.textContent = String(logic.counter.value)
  if (doubledEl) doubledEl.textContent = String(logic.doubled.value)
}, 'vanilla:renderCounter')

incBtn?.addEventListener('click', () => logic.inc())
resetBtn?.addEventListener('click', () => logic.reset())

// При удалении виджета со страницы очищаем подписку эффекта
// stopRenderEffect()
```

## Работа с асинхронными ресурсами (`resource`) в чистом JS

Примитив `engine.resource()` управляет флагами загрузки, ошибками и отменой устаревших запросов через `AbortController` без сторонних библиотек:

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
    statusEl.textContent = 'Загрузка статьи...'
    return
  }
  if (error) {
    statusEl.textContent = `Ошибка: ${error.message}`
    return
  }
  if (data) {
    statusEl.textContent = `#${data.id}: ${data.title}`
  }
})

// Быстрые клики автоматически отменят предыдущие незавершённые fetch-запросы
nextBtn?.addEventListener('click', () => {
  posts.postId.value += 1
})
```

## Важные рекомендации для Vanilla JS

* **Сохраняйте функцию отписки `engine.effect()`:** Вызов `engine.effect(...)` возвращает функцию очистки `() => void`. Вызывайте её при удалении динамических блоков со страницы (SPA-роутинг, модальные окна), чтобы не удерживать ссылки на удалённые DOM-элементы в замыканиях.
* **Используйте `engine.batch()` при массовых синхронных изменениях из DOM-событий:** Хотя внутри стандартных микрозадач батчинг работает автоматически, при явной группировке нескольких мутаций в одном обработчике события используйте `engine.batch(() => { ... })`.
