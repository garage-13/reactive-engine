---
layout: doc
prev:
  text: React tools
  link: '/react'
next:
  text: 'Пример 001: Счетчик'
  link: '/examples/signal/001'
---

# Быстрый старт с React

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

## Шаг 1. Определение логики в виде отдельного сервиса

Бизнес-логика оформляется в виде независимых сервисов (классов), которые затем подключаются к React-компонентам через специализированные хуки.

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-001:signal:counter');

  public inc() {
    this.counter.value += 1
  }
}
```

## Шаг 2. Интеграция с UI (React-компонент)

Для подписки на реактивные изменения используется хук `useReactiveValue`. Он извлекает чистое значение и подписывает компонент на обновления.

```tsx
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { Logic } from './Logic'

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div>
      <div>Signal example</div>
      <code>{counter}</code>
      <div>
        <button
          onClick={() => logic.inc()}
        >+ INC</button>
      </div>
    </div>
  )
}
```
