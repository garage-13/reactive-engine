import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'

// Единственный инстанс движка на все Vue-приявление
export const vueEngine = new ReactiveEngine4Vue({
  logger: {
    isEnabled: true, // Включаем логгер
    traceTime: true, // Добавляем вывод таймингов по желанию
    filter: /^example-*/ // Можно фильтровать только нужные логи
  }
})
