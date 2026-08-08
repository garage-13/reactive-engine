# Использование Core-сервисов во Vue 3

Пакет `@pravosleva/reactive-engine/vue` предоставляет бесшовную интеграцию полиморфных Core-сервисов вашего приложения с **Vue 3 Composition API**.

Класс `ReactiveEngine` из подпакета `/vue` расширяет базовое ядро и преобразует сигналы движка в стандартные Vue `ShallowRef` объекты с автоматическим управлением жизненным циклом подписок, полностью защищая приложение от утечек памяти как в UI-компонентах, так и в независимых областях видимости эффектов (`EffectScope`).

### Особенности рантайма и автоматическая очистка

Адаптер спроектирован как универсальное (isomorphic) решение и автоматически определяет контекст, в котором он был вызван:

1. **Внутри компонентов (`setup`)**: Если метод `.use()` вызван во время инициализации компонента, адаптер автоматически регистрирует хук `onUnmounted` и отписывается от сигналов ядра при размонтировании DOM-узла.
2. **Внутри EffectScope (Pinia / Кастомные Composables)**: Если метод вызван вне UI, но внутри активной области видимости эффектов (например, в Pinia-сторе), адаптер регистрирует хук `onScopeDispose`. Подписка будет уничтожена вместе со сбросом этого скоупа.
3. **Глобальный контекст**: Если метод вызван в глобальной области видимости, подписка останется активной на всё время жизни приложения.

### Пример реализации компонента (Vue 3 Composition API)

Для людей, изучающих Vue, ниже представлен каноничный пример интеграции чистой бизнес-логики счетчика в компонент с использованием синтаксиса `<script setup>`:

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine';
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue';
import clsx from 'clsx';

// Импортируем ваши общие стили песочницы (CSS/SCSS модули)
import baseClasses from '~/ui.common.module.scss';
import btnClasses from '~/ui.button.module.scss';

// 1. Описываем изолированную бизнес-логику (Ядро/Сервис) — код 1-в-1 как в React/Angular
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example:vue:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example:vue:computed');

  public inc = () => {
    this.counter.value += 1;
  };
}

// 2. Инициализируем Vue-версию движка
const engine = new ReactiveEngine4Vue();

// 3. Внедряем сервис из DI-контейнера движка
const logic = engine.inject(CounterLogic);

// 4. Локальные Vue-реактивные обертки со стартовыми значениями сигналов.
// Метод .use() возвращает стандартный ShallowRef<T> объект.
const counter = engine.use(logic.counter);
const doubledCounter = engine.use(logic.doubledCounter);
</script>

<template>
  <!-- Использование классов и clsx идентично React-окружению -->
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel">Vue 3 Signal Example</div>

    <!--
      ⚠️ Обратите внимание для изучающих Vue:
      В шаблонах Vue 3 объекты ref/shallowRef разворачиваются автоматически.
      Писать `counter.value` внутри тегов {{ }} НЕ нужно — это вызовет ошибку.
    -->
    <code>{{ counter }} | x2 = {{ doubledCounter }}</code>

    <div :class="baseClasses.catSection">
      <!-- Вешаем слушатель события клика через директиву @click -->
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

### Архитектурные преимущества интеграции:
* **Zero-overhead реактивность:** Благодаря использованию `shallowRef` вместо глубокого `ref`, Vue не тратит ресурсы процессора на рекурсивный прокси-обход тяжелых структур данных, приходящих из ядра.
* **Принудительные триггеры (`triggerRef`):** Внутри подписки адаптера зашит вызов `triggerRef`. Это гарантирует, что если сигнал вашего ядра обновит внутреннее свойство сложного объекта или массива без мутации самой ссылки, Vue гарантированно и мгновенно перерисует интерфейс.
* **Полная совместимость с экосистемой:** Полученные через `.use()` переменные являются нативными реактивными примитивами Vue. Вы можете передавать их в watch-трекеры, вычисляемые свойства `computed(() => ...)` самого фреймворка или выводить в секции `<style>` через `v-bind`.

## Анализ поддерживаемых версий Vue
Разработанный адаптер **ReactiveEngine4Vue** официально поддерживает Vue 3.2.0 и все последующие версии (включая Vue 3.3, 3.4, 3.5 и новее).
Нижняя и верхняя границы поддержки обусловлены следующими архитектурными особенностями:
- Composition API и shallowRef: Метод `.use()` преобразует сигналы вашего ядра в нативные легковесные обёртки shallowRef. Этот функционал стал стандартом индустрии начиная с релиза Vue 3.
- Появление EffectScope (Vue 3.2+): Наш адаптер использует продвинутые методы `getCurrentScope()` и `onScopeDispose()`. Механизм EffectScope был встроен в ядро фреймворка в версии Vue 3.2. Именно он позволяет использовать `.use()` не только внутри UI-компонентов, но и в изолированных контекстах: Pinia-сторах, плагинах, Vue Router или независимых composable-функциях вне жизненного цикла компонентов.
- Принудительный триггер (`triggerRef`): Использование `triggerRef(state)` гарантирует, что Vue мгновенно зафиксирует изменения синхронных или асинхронных сигналов ядра, даже если они оперируют сложными вложенными объектами и массивами без смены ссылок.
