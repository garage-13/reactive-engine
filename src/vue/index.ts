import { CleanupFn, ISignalLike } from '../core/types'
import { ReactiveEngineAutomatic } from '../core/core'
import { getCurrentInstance, getCurrentScope, onScopeDispose, onUnmounted, shallowRef, ShallowRef, triggerRef } from 'vue'

export { useReactiveValue } from './core.vue-adapter'

class ExtendedReactiveEngine extends ReactiveEngineAutomatic {
  protected override frameworkPrefix = 'vue-auto'

  public override reactive<T extends object>(target: T, name?: string): T {
    const injectVueMarkers = (obj: any) => {
      if (!obj || typeof obj !== 'object' || Symbol.iterator in obj) return

      if (!Reflect.has(obj, '__subscribe')) {
        Object.defineProperty(obj, '__subscribe', {
          get: () => {
            return (cb: () => void) => {
              return this.effect(() => {
                try {
                  JSON.stringify(originalProxy)
                } catch (e) {
                  Object.values(originalProxy as Record<string, unknown>)
                }
                cb()
              }, 'vue-proxy-internal-subscription')
            }
          },
          configurable: true,
          enumerable: false
        })
      }

      if (!Reflect.has(obj, '__v_skip')) {
        Object.defineProperty(obj, '__v_skip', {
          get: () => true,
          configurable: true,
          enumerable: false
        })
      }

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'object') {
          injectVueMarkers(obj[key])
        }
      }
    }

    injectVueMarkers(target)
    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  /**
   * Адаптирует примитивы реактивного ядра во Vue ShallowRef объекты.
   * Полностью изолирует начальное чтение от реактивного контекста ядра (Topological Isolation).
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      return shallowRef(item) as any
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      
      // ⚛️ КЛЮЧЕВОЙ ФИКС: Чтение стартового значения оборачиваем в untrack(),
      // предотвращая ложные каскадные вызовы Pull-валидатора при инициализации!
      const initialValue = this.untrack(() => signalItem.value)
      const state = shallowRef(initialValue)

      // Используем пассивный хук __subscribe, если он доступен (для computed-нод),
      // чтобы избежать спама множественных push-уведомлений посреди транзакции
      const hasHook = '__subscribe' in signalItem && typeof (signalItem as any).__subscribe === 'function'
      
      const unsubscribe = hasHook 
        ? (signalItem as any).__subscribe(() => {
            state.value = signalItem.value
            triggerRef(state)
          })
        : signalItem.subscribe((newValue) => {
            state.value = newValue
            triggerRef(state)
          })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }

      return state as any
    }

    const state = shallowRef(item)

    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      const unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        triggerRef(state)
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }
    }

    return state as any
  }
}

export { ExtendedReactiveEngine as ReactiveEngine }
