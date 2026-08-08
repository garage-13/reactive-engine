import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core'

export class ReactiveEngine4Vue extends OriginalReactiveEngine {
  /**
   * Использование реактивного значения в Vue компоненте или EffectScope.
   */
  public use<T>(item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn }): ShallowRef<T> {
    // Создаем локальную Vue-реактивную обертку со стартовым значением сигнала
    const state = shallowRef(item.value)

    // Подписываемся на изменения сигнала ядра
    const unsubscribe = item.subscribe((newValue) => {
      state.value = newValue // Обновляем Vue-реактивную переменную
      triggerRef(state)      // 👈 ПРИНУДИТЕЛЬНО заставляем Vue перерисовать шаблон
    })

    // Проверяем наличие активного компонента ИЛИ active области видимости эффектов

    // 1. Если мы находимся внутри жизненного цикла компонента Vue (setup)
    if (getCurrentInstance()) {
      // Автоматически отписываемся при размонтировании Vue-компонента
      onUnmounted(() => {
        unsubscribe()
      })
    }
    // 2. Иначе, если мы находимся внутри изолированного EffectScope (например, в Pinia или в тестах)
    else if (getCurrentScope()) {
      onScopeDispose(() => {
        unsubscribe()
      })
    }

    return state
  }
}
