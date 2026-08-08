<script setup lang="ts">
import { computed } from 'vue'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

// 1. Изолированная бизнес-логика ядра (полностью идентична React-версии)
class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-202:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-202:computed:counter');

  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search-incorrect`,
          '?',
          [
            `counter=${counterValue}`,
            '_responseDelay=10000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      )
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    },
    this.counter,
    {
      name: 'example-202:resource:exp-backoff-exp',
      retryCount: 4,
      retryDelay: 1000,
      isExponentialBackoffEnabled: true,
      maxRetryDelay: 10000,
      validateBeforeFetch: (counterValue) => {
        if (counterValue === 0) {
          return `Not started (pre-validation before fetch) for count value ${counterValue}`;
        }
        return true;
      },
    }
  )

  public inc = () => {
    this.counter.value += 1
  }
}

// 2. Инициализируем Vue-версию движка
const engine = new ReactiveEngine4Vue()
const logic = engine.inject(Logic)

// 3. Адаптируем реактивные примитивы под Composition API (возвращают ShallowRef)
const counter = engine.use(logic.counter)
const apiResourceState = engine.use(logic.apiState)

// 4. Вытаскиваем атомарные свойства ресурса через computed для отслеживания во Vue
const loading = computed(() => apiResourceState.value?.loading)
const data = computed(() => apiResourceState.value?.data)
const error = computed(() => apiResourceState.value?.error)
const isRetrying = computed(() => apiResourceState.value?.isRetrying)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel" title="Resource with exponential backoff support">
      Resource with exponential backoff support (Vue)
    </div>
    <code>{{ BASE_API_URL }}</code>

    <div style="min-width: 100%;">
      <button
        @click="logic.inc"
        :class="clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])"
      >
        ({{ counter }}) Refresh account data
      </button>
    </div>

    <div style="display: flex; gap: 8px; flex-direction: row; flex-wrap: wrap; align-items: center;">
      <span>
        {{ loading ? '🟡 loading...' : data ? '🟢 ok' : error ? '🔴 err' : '⚪' }}
        | isRetrying: {{ String(isRetrying) }}
      </span>
      <em v-if="error?.message">{{ error.message }}</em>
    </div>

    <pre :class="baseClasses.preNormalizedMin">{{ JSON.stringify({ data }, null, 2) }}</pre>
  </div>
</template>
