import { CleanupFn, ISignalLike } from '../core/types'
import { ReactiveEngineAutomatic } from '../core/core'
import { getCurrentInstance, getCurrentScope, onScopeDispose, onUnmounted, shallowRef, ShallowRef, triggerRef } from 'vue'

export { useReactiveValue } from './core.vue-adapter'

/**
 * ⚛️ Расширенный интерфейс для поддержки внутренних маркеров Vue и Ядра на прокси-объектах
 */
interface IVueProxyExtensions {
  __subscribe?: (cb: () => void) => CleanupFn;
  __v_skip?: boolean;
}

class ExtendedReactiveEngine extends ReactiveEngineAutomatic {
  protected override frameworkPrefix = 'vue-auto'

  public override reactive<T extends object>(target: T, name?: string): T {
    // Внутренний кэш оригинального прокси, который будет доступен в замыкании макрозадачи подписки
    let originalProxy: T

    const injectVueMarkers = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object' || Symbol.iterator in (obj as object)) return

      const targetObj = obj as Record<string, unknown> & IVueProxyExtensions

      if (!Reflect.has(targetObj, '__subscribe')) {
        Object.defineProperty(targetObj, '__subscribe', {
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

      if (!Reflect.has(targetObj, '__v_skip')) {
        Object.defineProperty(targetObj, '__v_skip', {
          get: () => true,
          configurable: true,
          enumerable: false
        })
      }

      for (const key in targetObj) {
        if (Object.prototype.hasOwnProperty.call(targetObj, key)) {
          const value = targetObj[key]
          if (value !== null && typeof value === 'object') {
            injectVueMarkers(value)
          }
        }
      }
    }

    injectVueMarkers(target)
    originalProxy = super.reactive(target, name)
    return originalProxy
  }

  /**
   * Адаптирует примитивы реактивного ядра во Vue ShallowRef объекты.
   * Полностью изолирует начальное чтение от реактивного контекста ядра (Topological Isolation).
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
    type ReturnType = T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>

    if (item === null || item === undefined || typeof item !== 'object') {
      return shallowRef(item) as ReturnType
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    if (isSignal) {
      const signalItem = item as unknown as ISignalLike<unknown>

      // ⚛️ КЛЮЧЕВОЙ ФИКС: Чтение стартового значения оборачиваем в untrack(),
      // предотвращая ложные каскадные вызовы Pull-валидатора при инициализации!
      const initialValue = this.untrack(() => signalItem.value)
      const state = shallowRef(initialValue)

      // Используем пассивный системный хук __subscribe, если он доступен (для computed-нод),
      // чтобы избежать спама множественных push-уведомлений посреди транзакции
      const hasHook = '__subscribe' in signalItem && typeof signalItem.__subscribe === 'function'

      const unsubscribe = hasHook && signalItem.__subscribe
        ? signalItem.__subscribe(() => {
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

      return state as ReturnType
    }

    const state = shallowRef(item)
    const potentialProxy = item as Record<string, unknown> & IVueProxyExtensions

    if ('__subscribe' in potentialProxy && typeof potentialProxy.__subscribe === 'function') {
      const unsubscribe = potentialProxy.__subscribe(() => {
        triggerRef(state)
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }
    }

    return state as ReturnType
  }
}

export { ExtendedReactiveEngine as ReactiveEngine }
