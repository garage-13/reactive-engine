## Integrating Core Services with Vue 3

The `@pravosleva/reactive-engine/vue` sub-package provides a seamless, high-performance integration of your polymorphic core services with **Vue 3 Composition API**.

The `ReactiveEngine` class from the `/vue` directory extends your core state machine and maps engine signals into standard Vue `ShallowRef` objects. It features automatic subscription lifecycle management via `EffectScope`, entirely protecting your application from memory leaks both inside UI components and within detached reactivity scopes (like Pinia stores).

### Runtime Context & Automated Cleanup

The adapter is designed as an isomorphic solution that dynamically determines the runtime context in which it was called:

1. **Inside UI Components (`setup`)**: If the `.use()` method is called during component initialization, the adapter automatically hooks into the native `onUnmounted` lifecycle event to destroy core subscriptions when the DOM node is unmounted.
2. **Inside EffectScope (Pinia / Custom Composables)**: If invoked outside UI lifecycles but within an active effect scope (e.g., inside a Pinia store definition), the adapter registers the `onScopeDispose` hook. Subscriptions are automatically closed when that specific scope is cleared.
3. **Global Context**: If called in a global file, the subscription remains permanently active for the entire application lifespan.

### Basic Component Example (Vue 3 Composition API)

For developers learning Vue, here is a reference implementation showing how to bind pure JavaScript business logic to a Vue template using the `<script setup>` syntax:

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine';
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue';
import clsx from 'clsx';

// Import shared sandbox styles (CSS/SCSS Modules)
import baseClasses from '~/ui.common.module.scss';
import btnClasses from '~/ui.button.module.scss';

// 1. Define pure business logic (Core/Service) — 100% identical to React/Angular versions
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example:vue:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example:vue:computed');

  public inc = () => {
    this.counter.value += 1;
  };
}

// 2. Initialize the Vue-specific engine instance
const engine = new ReactiveEngine4Vue();

// 3. Inject the service from the engine DI container
const logic = engine.inject(CounterLogic);

// 4. Adapt core reactive primitives to Composition API.
// The .use() method returns a standard Vue ShallowRef<T> object.
const counter = engine.use(logic.counter);
const doubledCounter = engine.use(logic.doubledCounter);
</script>

<template>
  <!-- Utility class styling using clsx works exactly like in React -->
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel">Vue 3 Signal Example</div>

    <!--
      ⚠️ Important Note for Vue Beginners:
      Inside Vue 3 templates, ref/shallowRef objects are automatically unwrapped.
      Do NOT explicitly write `counter.value` inside {{ }} — it will evaluate incorrectly.
    -->
    <code>{{ counter }} | x2 = {{ doubledCounter }}</code>

    <div :class="baseClasses.catSection">
      <!-- Bind click listeners using the native @click directive -->
      <button
        @click="logic.inc"
        :class="clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])"
      >
        INC (Vue)
      </button>
    </div>
  </div>
</template>
```

### Architectural Key Benefits:
* **Zero-Overhead Reactivity**: By wrapping values in `shallowRef` instead of deep `ref` proxies, Vue completely avoids recursive property scanning on heavy core data structures, saving massive CPU cycles on large payloads.
* **Forced Render Triggers (`triggerRef`)**: The adapter's subscription closure contains an embedded `triggerRef` call. This guarantees that if a core library signal modifies a nested field of a deep object or array without breaking the parent reference, Vue is forced to instantly re-render the affected DOM nodes.
* **Full Ecosystem Interoperability**: Since `.use()` produces native Vue reactive primitives, you can comfortably feed them directly into Vue watch-trackers, framework-level `computed(() => ...)` hooks, or pass them dynamically to CSS variables via `v-bind`.

## Vue 3 Version Support Analysis

The developed adapter ReactiveEngine4Vue officially supports Vue 3.2.0 and all subsequent versions (including Vue 3.3, 3.4, 3.5, and newer).
The lower and upper bounds of this compatibility matrix are determined by the following core architectural requirements:
- **Composition API & `shallowRef`**: The `.use()` method converts your core library signals into native, lightweight Vue shallowRef wrappers. This reactive primitive has been the industry standard since the initial release of Vue 3.
- **Introduction of EffectScope** (Vue 3.2+): Our adapter leverages advanced reactivity tracking via `getCurrentScope()` and `onScopeDispose()`. The EffectScope mechanism was natively integrated into the Vue core in version 3.2. It allows developers to safely invoke `.use()` not only within standard UI components but also inside independent contexts like Pinia stores, router guards, or custom headless composables outside the component lifecycle.
- **Enforced Render Triggers (`triggerRef`)**: The integration of `triggerRef(state)` ensures that Vue instantly captures any synchronous or asynchronous core signal updates, even when dealing with complex nested objects or arrays without altering their top-level references.
