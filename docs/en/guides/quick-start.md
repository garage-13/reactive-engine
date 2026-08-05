---
layout: doc
next:
  text: 'Example 001: Counter'
  link: '/en/examples/signal/001'
---

# Quick Start with React

## Install

```bash
yarn add @pravosleva/reactive-engine
```

## Step 1. Defining the Logic (Service)

Business logic is encapsulated in decoupled services (classes), which are then connected to React components using specialized hooks.

```ts
import { AbstractService } from '@pravosleva/reactive-engine'

export class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-001:signal:counter');

  public inc() {
    this.counter.value += 1
  }
}
```

## Step 2. UI Integration (React Component)

To subscribe to reactive changes, use the `useReactiveValue` hook. It extracts the raw value and subscribes the component to updates.

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
