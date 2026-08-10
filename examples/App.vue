<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
// Теперь TypeScript и Vite поймут этот импорт внутри Vue
import baseClasses from '~/ui.common.module.scss'
import CardModalWrapper from './shared/CardModalWrapper.vue'
import Example003 from './003-signal-counter-vue/Example003.vue'
import Example108 from './108-computed-vue/Example108.vue'
import Example110 from './110-compuled-batching-vue/Example110.vue'
import Example250 from './250-resource-vue/Example250.vue'
import Example251 from './251-multi-resource-vue/Example251.vue'
import Example252 from './252-resource-exponential-backoff-vue/Example252.vue'
import Example253 from './253-resource-withLongPolling-vue/Example253.vue'
import { vueEngine } from './engine.vue'
import clsx from 'clsx'

class AppLogic extends AbstractService {
  public title = this.engine.signal<string>('Reactive Engine Sandbox', 'app:title');
}

const logic = vueEngine.inject(AppLogic)
const appTitle = vueEngine.use(logic.title)
</script>

<template>
  <!-- Использование 1-в-1 как в React -->
  <div :class="clsx(baseClasses.stack4, baseClasses.appWrapper)">
    <div :class="baseClasses.stack0">
      <h2>(Vue 3) 0. {{ appTitle }}</h2>
      <div :class="clsx(baseClasses.unitsWrapper)">
        <CardModalWrapper
          title="Example 003"
          description="Counter"
        >
          <Example003 />
        </CardModalWrapper>
      </div>
    </div>
    <div :class="baseClasses.stack0">
      <h2>(Vue 3) 1. Computed</h2>
      <div :class="clsx(baseClasses.unitsWrapper)">
        <CardModalWrapper
          title="Example 108"
          description="Computed"
        >
          <Example108 />
        </CardModalWrapper>
        <CardModalWrapper
          title="Example 110"
          description="Microtask Cluster Show"
        >
          <Example110 />
        </CardModalWrapper>
      </div>
    </div>
    <div :class="baseClasses.stack0">
      <h2>(Vue 3) 2. Resource</h2>
      <div :class="clsx(baseClasses.unitsWrapper)">
        <CardModalWrapper
          title="Example 250"
          description="Resource"
        >
          <Example250 />
        </CardModalWrapper>
        <CardModalWrapper
          title="Example 251"
          description="Resource"
        >
          <Example251 />
        </CardModalWrapper>
        <CardModalWrapper
          title="Example 252"
          description="Resource"
        >
          <Example252 />
        </CardModalWrapper>
        <CardModalWrapper
          title="Example 253"
          description="Long Polling Decorator"
        >
          <Example253 />
        </CardModalWrapper>
      </div>
    </div>
  </div>
</template>
