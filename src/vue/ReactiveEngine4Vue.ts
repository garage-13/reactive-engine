import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core'

export class ReactiveEngine4Vue extends OriginalReactiveEngine {
  protected override frameworkPrefix = 'vue'

  /**
   * Использование реактивного значения в Vue компоненте или EffectScope.
   * Нативно поддерживает сигналы (Push) и ленивые вычисляемые свойства (Pull).
   */
  public use<T>(item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn }): ShallowRef<T> {
    // Создаем локальную Vue-реактивную обертку со стартовым значением сигнала/computed
    const state = shallowRef(item.value)

    // Подписываемся на изменения реактивного элемента ядра
    const unsubscribe = item.subscribe((newValue) => {
      state.value = newValue // Обновляем Vue-реактивную переменную
      triggerRef(state) // ПРИНУДИТЕЛЬНО заставляем Vue перерисовать шаблон
    })

    // Автоматическое управление жизненным циклом подписок во Vue
    if (getCurrentInstance()) {
      onUnmounted(() => {
        unsubscribe()
      })
    } else if (getCurrentScope()) {
      onScopeDispose(() => {
        unsubscribe()
      })
    }

    return state
  }
}
