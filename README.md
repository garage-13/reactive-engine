# 🚀 ReactiveEngine Core Framework
A lightweight, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless React integration.

## Instruction
- 🇬🇧 [In English](https://pravosleva.pro/reactive-engine/en)
- 🇷🇺 [In Russian](https://pravosleva.pro/reactive-engine)


## 🎯 What Problems This Library Solves

When building large-scale React applications, developers constantly run into architectural bottlenecks imposed by built-in state tools. `@pravosleva/reactive-engine` is designed to elegantly solve the following pain points:

1. **Unnecessary Over-Rendering:**
> * *The Problem:* React Context API and traditional immutability-based stores (Redux/Zustand) force all components reading from that state slice to re-render whenever even a single deeply nested property changes.
> * *The Solution:* Fine-grained reactivity. Components micro-subscribe only to the specific primitive signals they display. State mutations update strictly the necessary DOM nodes.

2. **UI Tearing and Lags in React 18+:**
> * *The Problem:* Under React Concurrent Mode, standard external state managers can lead to UI tearing, where different parts of the screen temporarily display asynchronous, mismatching data.
> * *The Solution:* The `useReactiveValue` hook is built on top of native `useSyncExternalStore`. This ensures absolute cross-component synchronization, shielding your interface from glitches and tearing.

3. **Expensive CPU Re-calculations:**
> * *The Problem:* Heavy array filtration, sorting, or data analytics functions trigger re-evaluations on every parent re-render or whenever unrelated props shift.
> * *The Solution:* Lazy `Computed` properties with O(1) computation caching. The logic evaluates *only* when its underlying dependency signals change.

4. **Network Request Flooding (Race Conditions):**
> * *The Problem:* A user rapidly clicking through catalog filters or pagination options spawns cascades of overlapping network requests. An older, slower request might resolve *after* a newer one, overwriting fresh data (Race Condition).
> * *The Solution:* The `Resource` utility automatically orchestrates native `AbortController` instances. Whenever dependency signals change, the previous pending fetch request is instantly cancelled at the browser's system level.

5. **Cascading UI Updates (Render Cascades):**
> * *The Problem:* Updating 3–4 connected state parameters inside a single event handler prompts 3–4 sequential UI update ticks, clogging the Event Loop.
> * *The Solution:* 100% out-of-the-box automatic batching. The engine bundles all consecutive synchronous and asynchronous modifications into a single microtask, triggering exactly 1 final unified re-render.

6. **Memory Leaks in Dynamic Architectures:**
> * *The Problem:* Dynamically instantiating computed properties (e.g., dynamically filtering an active tab) accumulates abandoned reactive effects in memory that continue to listen to global state updates forever.
> * *The Solution:* Built-in memory cleanup and computation memoization inside the core engine. The library hooks automatically trigger `.destroy()` on component unmount, seamlessly purging dead reactive effects from RAM.

## 📦 Installation

Install the package via your favorite package manager:

```bash
yarn add @pravosleva/reactive-engine
```

## `peerDependencies`

```json
{
  "@angular/core": ">=16.0.0",
  "react": "^18.0.0 || ^19.2.0",
  "react-dom": "^18.0.0 || ^19.2.0",
  "vue": ">=3.2.0"
}
```

## React

```tsx
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-01:signal:counter');

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div>
      <div>Signal example</div>
      <code>{counter}</code>
      <div className={baseClasses.catSection}>
        <button onClick={() => logic.inc()}>+ INC</button>
      </div>
    </div>
  )
}
```

## Vue 3

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'

class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'vue-example:counter');

  public inc = () => {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine4Vue()
const logic = engine.inject(CounterLogic)
const counter = engine.use(logic.counter)
</script>

<template>
  <div>
    <div>Vue 3 Signal Example</div>

    <!-- Убираем .value, доверяем автоматическому развертыванию Vue -->
    <code>{{ counter }}</code>

    <div>
      <button @click="logic.inc">
        INC
      </button>
    </div>
  </div>
</template>
```

## Angular

```ts
import { Component } from '@angular/core'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular'

// 1. Описываем изолированную бизнес-логику (Ядро/Сервис) — код 1-в-1 как в React/Vue
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'angular-example:counter');

  public inc = () => {
    this.counter.value += 1;
  };
}

@Component({
  selector: 'app-counter-example',
  standalone: true,
  // В шаблоне Angular Signals вызываются как функции: counter()
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular 16+ Signal Example</div>
      <code>{{ counter() }}</code>
      <div class="catSection">
        <button (click)="logic.inc()" class="btn neonBtn neonBtn--primary neonBtn--outlined">
          INC (Angular)
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./ui.common.module.scss', './ui.button.module.scss'] // Ваши SCSS стили
})
export class AngularCounterComponent {
  // 2. Инициализируем Angular-версию движка
  private engine = new ReactiveEngine4Angular();

  // 3. Внедряем сервис из DI-контейнера
  public logic = this.engine.inject(CounterLogic);

  // 4. Превращаем сигнал ядра в нативный Angular Signal через метод .use()
  // Метод inject(DestroyRef) под капотом use() отработает корректно, так как мы находимся в фазе инициализации класса
  public counter = this.engine.use(this.logic.counter);
}
```
