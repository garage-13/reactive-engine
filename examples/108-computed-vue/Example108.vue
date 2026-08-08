<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

// 1. Описываем изолированную бизнес-логику (Ядро/Сервис)
class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-100:signal:counter');

  // Создаем вычисляемое значение встроенными средствами вашего ядра
  public doubledCounter = this.engine.computed<number>(
    () => this.counter.value * 2,
    'example-100:computed:counter'
  );

  // Объявляем как стрелочную функцию для сохранения контекста 'this' во Vue шаблоне
  public inc = () => {
    this.counter.value += 1
  }
}

// 2. Инициализируем Vue-версию движка
const engine = new ReactiveEngine4Vue()
const logic = engine.inject(Logic)

// 3. Передаем оба реактивных примитива ядра во Vue-адаптер.
// Метод .use() превратит их в независимые Vue ShallowRef объекты.
const counter = engine.use(logic.counter)
const doubledCounter = engine.use(logic.doubledCounter)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel">Computed (Vue)</div>

    <!--
      В шаблоне мы выводим обе переменные БЕЗ .value, так как Vue автоматически
      раскрывает ShallowRef, а наш triggerRef в адаптере мгновенно обновит их в DOM.
    -->
    <code>{{ counter }} | x2 = {{ doubledCounter }}</code>

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
