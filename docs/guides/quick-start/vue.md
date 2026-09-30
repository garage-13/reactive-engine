---
layout: doc
prev:
  text: Vue tools
  link: '/vue'
next:
  text: 'Пример 003: Счетчик'
  link: '/examples/signal/003'
---

# Быстрый старт с Vue 3.2+

## Установка

```bash
yarn add @pravosleva/reactive-engine
```

## Простой счетчик

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/vue'

class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'vue-example:counter');

  public inc = () => {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()
const logic = engine.inject(CounterLogic)
const counter = engine.use(logic.counter)
</script>

<template>
  <div>
    <div>Vue 3 Signal Example</div>
    <code>{{ counter }}</code>
    <div>
      <button @click="logic.inc">
        + INC
      </button>
    </div>
  </div>
</template>
```
