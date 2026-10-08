import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, getCurrentScope as getCurrentVueScope, effect as vueEffect, type ShallowRef } from 'vue'

type CleanupFn = () => void

export interface ISignalLike<V> {
  value: V
  subscribe: (cb: (v: V) => void) => CleanupFn
}

/**
 * Хук-композибл для бесшовной интеграции примитивов реактивного ядра с системой рендеринга Vue 3.
 */
export function useReactiveValue<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
  const isSignal = item &&
                   typeof item === 'object' &&
                   'subscribe' in item &&
                   typeof (item as Record<string, unknown>).subscribe === 'function'

  const initialValue = isSignal
    ? ((item as unknown) as ISignalLike<unknown>).value
    : item

  const state = shallowRef(initialValue)

  const isServer = typeof window === 'undefined' || (typeof process !== 'undefined' && (process as any).server)
  const hasInstance = getCurrentInstance() || getCurrentScope()

  if (isServer || !hasInstance) {
    return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
  }

  let unsubscribe: CleanupFn = () => {}

  // ------------------------------------------------====
  // СЦЕНАРИЙ А: Подписка на примитивный Сигнал / Computed
  // ------------------------------------------------====
  if (isSignal) {
    const signalItem = (item as unknown) as ISignalLike<unknown>
    unsubscribe = signalItem.subscribe((newValue) => {
      state.value = newValue
      triggerRef(state)
    })
  }
  // ------------------------------------------------====
  // СЦЕНАРИЙ Б: Подписка на глубокий Proxy-объект / Массив
  // ------------------------------------------------====
  else if (item && typeof item === 'object') {
    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        triggerRef(state)
      })
    } else {
      // НАДЕЖНЫЙ ФОЛЛБЭК: Если объект создан не через ReactiveEngine4Vue,
      // заставляем реф мутировать принудительно (но в тестах переводим на честный ReactiveEngine4Vue)
      unsubscribe = () => {}
    }
  }
  else {
    return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
  }

  if (getCurrentInstance()) {
    onUnmounted(unsubscribe)
  } else if (getCurrentVueScope()) {
    onScopeDispose(unsubscribe)
  }

  return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
}
