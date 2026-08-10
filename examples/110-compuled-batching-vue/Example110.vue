<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

// 1. Описываем каскадную бизнес-логику "Домино" внутри сервиса ядра
class ClusterLogic extends AbstractService {
  // Корневой сигнал
  public count = this.engine.signal<number>(1, 'example-110:signal:count');

  // Каскадные computed-вычисления, где каждое следующее зависит от предыдущего
  public computedA = this.engine.computed<number>(() => {
    return this.count.value + 10;
  }, 'example-110:computed:step-A');

  public computedB = this.engine.computed<number>(() => {
    return this.computedA.value * 2;
  }, 'example-110:computed:step-B');

  public computedC = this.engine.computed<number>(() => {
    return this.computedB.value - 5;
  }, 'example-110:computed:step-C');

  public computedD = this.engine.computed<string>(() => {
    return this.computedC.value % 2 === 0 ? 'Четное' : 'Нечетное';
  }, 'example-110:computed:step-D');

  // Синхронный экшен изменения корневого состояния
  public triggerClusterTick = () => {
    this.count.value += 1;
  }
}

// 2. Инициализируем Vue-версию движка с логгером
const engine = new ReactiveEngine4Vue({
  logger: {
    isEnabled: true,
    traceTime: true,
    filter: /^example-110.*/ // Фильтруем логи строго для этого Vue-компонента
  }
})
const logic = engine.inject(ClusterLogic)

// 3. Адаптируем примитивы ядра во Vue ShallowRef объекты через .use()
const count = engine.use(logic.count)
const valA = engine.use(logic.computedA)
const valB = engine.use(logic.computedB)
const valC = engine.use(logic.computedC)
const valD = engine.use(logic.computedD)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses['unit--wide'], baseClasses.stack2)" style="font-family: system-ui; width: 650px;">
    <div :class="baseClasses.absoluteUnitLabel">Microtask Cluster Show (Vue 3 — Example 110)</div>

    <div :class="baseClasses.stack1" style="font-family: monospace; font-size: 13px;">
      <div>🔢 Базовый сигнал: <span style="color: #00b4d8;">{{ count }}</span></div>
      <div>➡️ Шаг A (count + 10): <span>{{ valA }}</span></div>
      <div>➡️ Шаг B (stepA * 2): <span>{{ valB }}</span></div>
      <div>➡️ Шаг C (stepB - 5): <span>{{ valC }}</span></div>
      <div>🏁 Шаг D (Результат): <span style="color: #4caf50; font-weight: bold;">{{ valD }}</span></div>
    </div>

    <div :class="baseClasses.catSection">
      <button
        @click="logic.triggerClusterTick"
        :class="clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])"
      >
        💥 ЗАПУСТИТЬ КАСКАД В ОДИН ТИК
      </button>
    </div>
  </div>
</template>
