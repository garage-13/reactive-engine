<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

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
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel">Vue 3 Signal Example</div>

    <!-- Убираем .value, доверяем автоматическому развертыванию Vue -->
    <code>{{ counter }}</code>

    <div :class="baseClasses.catSection">
      <button
        @click="logic.inc"
        :class="clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])"
      >
        INC
      </button>
    </div>
  </div>
</template>
