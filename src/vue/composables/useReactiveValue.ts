import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'

type CleanupFn = () => void
interface ReactiveItem<T> {
  value: T
  subscribe: (cb: (v: T) => void) => CleanupFn
}

/**
 * Хук для связывания сигналов и computed-свойств реактивного ядра с шаблоном Vue 3.
 * Автоматически управляет подписками и предотвращает утечки памяти на SSR-сервере.
 */
export function useReactiveValue<T>(item: ReactiveItem<T>): ShallowRef<T> {
  // 1. Создаем локальную Vue-реактивную обертку со стартовым значением
  const state = shallowRef(item.value)

  // 2. Подписываемся на изменения элемента ядра
  const unsubscribe = item.subscribe((newValue) => {
    state.value = newValue   // Обновляем Vue-переменную
    triggerRef(state)        // Принудительно заставляем Vue перерисовать шаблон
  })

  // 3. Автоматически отписываемся при уничтожении компонента или EffectScope
  if (getCurrentInstance()) {
    onUnmounted(unsubscribe)
  } else if (getCurrentScope()) {
    onScopeDispose(unsubscribe)
  }

  return state
}
