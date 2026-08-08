<script setup lang="ts">
import { computed } from 'vue'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

// 1. Описываем изолированную бизнес-логику (полностью идентична React)
class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-200:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-200:computed:counter');

  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      if (counterValue === 0)
        throw new Error(`[THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY=1] [MESSAGE=Stop for count value ${counterValue} - excepted from fetcher fn body]`)

      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search`,
          '?',
          [
            `counter=${counterValue}`,
            '_responseDelay=2000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      )
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    },
    this.counter,
    {
      name: 'example-200:resource',
    }
  )

  public inc = () => {
    this.counter.value += 1
  }
}

// 2. Инициализируем Vue-версию движка
const engine = new ReactiveEngine4Vue()
const logic = engine.inject(Logic)

// 3. Подписываемся на состояния через адаптер движка
const counter = engine.use(logic.counter)

// Получаем единый ShallowRef на объект состояния ресурса (содержит loading, data, error)
const apiResourceState = engine.use(logic.apiState)

// 4. Безопасно деструктурируем свойства для использования в шаблоне через computed.
// Это гарантирует, что при обновлении любого поля внутри ресурса, Vue мгновенно перерисует DOM.
const loading = computed(() => apiResourceState.value?.loading)
const data = computed(() => apiResourceState.value?.data)
const error = computed(() => apiResourceState.value?.error)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel">Resource example (Vue)</div>
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
      <!-- Используем вычисляемые свойства напрямую в шаблоне без .value -->
      <span>
        {{ loading ? '🟡 loading...' : data ? '🟢 ok' : error ? '🔴 err' : '⚪' }}
      </span>
      <em v-if="error?.message">{{ error.message }}</em>
    </div>

    <pre :class="baseClasses.preNormalizedMin">{{ JSON.stringify({ data }, null, 2) }}</pre>
  </div>
</template>
