# 🍏 `useReactiveValue` (Vue 3 Composable)

The `useReactiveValue` composable is a first-class functional bridge designed to seamlessly connect the framework-agnostic reactive core with Vue 3's template rendering system. It takes a raw core `signal` or `computed` property as an argument and returns a native Vue `ShallowRef<T>`, triggering fine-grained template updates via `triggerRef` upon every transaction commit.

Engineered with hybrid **Universal Rendering (SSR / Nuxt 3)** environments in mind, the composable features an internal runtime-aware guard using Vue's `getCurrentInstance()`. During the initial server-side pre-rendering pass (Nitro/Node.js), it operates in a passive single-read state to prevent the creation of dangling listeners, completely eliminating server-side memory leaks and ensuring a 100% mismatch-free client hydration process. Once mounted in the browser, it automatically binds a clean, self-cleaning subscription that disposes of itself in sync with the Vue component's or `EffectScope`'s unmount lifecycle.

## 🔥 Пример использования хука в компоненте Vue 3 / Nuxt 3
Теперь ваш код в `<script setup>` станет визуально идентичен React-версии библиотеки:

```vue
<script setup lang="ts">
import { useEngine } from '~/composables/useEngine'
import { useReactiveValue } from '@pravosleva/ractive-engine/vue'

const engine = useEngine()

// Создаем сигнал ядра
const counterSignal = engine.signal(10, 'nuxt:widget:counter')

// Передаем сигнал в хук — получаем чистый ShallowRef для Vue-шаблона
const countState = useReactiveValue(counterSignal)

const increment = () => {
  counterSignal.value += 1
}
</script>

<template>
  <div>
    <!-- Используем переменную со стандартным Vue-синтаксисом -->
    <p>Счетчик: <strong>{{ countState }}</strong></p>
    <button @click="increment">➕ Инкремент</button>
  </div>
</template>
```

### Почему этот хук идеален для экосистемы:
- **Полная безопасность для SSR:** Благодаря проверкам `getCurrentInstance()` внутри хука, при вызове на сервере подписка создаваться не будет, что гарантирует 100% защиту от утечек памяти в Node.js.
- **Унификация DX:** Ваши разработчики смогут использовать одну и ту же ментальную модель `useReactiveValue(signal)` при переключении между проектами на React и Vue 3.
