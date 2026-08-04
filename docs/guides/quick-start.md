---
layout: doc
next:
  text: 'Пример 001: Счетчик'
  link: '/examples/signal/001'
---

# Быстрый старт с React

```bash
yarn add @pravosleva/reactive-engine
```

Бизнес-логика оформляется в виде независимых сервисов (классов), которые затем подключаются к React-компонентам через специализированные хуки.

## 1. Определение логики (Сервис)

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-001:signal:counter');

  public inc() {
    this.counter.value += 1
  }
}
```

## 2. Интеграция с UI (React-компонент)

Для подписки на реактивные изменения используется хук `useReactiveValue`. Он извлекает чистое значение и подписывает компонент на обновления.

```tsx
import { ReactiveEngine } from '@pravosleva/reactive-engine'
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
