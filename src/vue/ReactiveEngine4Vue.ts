import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../core/core'
import { CleanupFn } from '../core/types'

export interface ISignalLike<V> {
  value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

/**
 * 💚 1. СИНХРОННЫЙ РЕАКТИВНЫЙ АДАПТЕР ДЛЯ VUE 3
 * Базируется на плоском синхронном Push/Pull графе ядра.
 */
export class ReactiveEngine4Vue extends ReactiveEngine {
  protected override frameworkPrefix = 'vue'

  /**
   * Переопределяем метод создания реактивных объектов для Vue-версии движка.
   * Рекурсивно внедряет свойства __subscribe и __v_skip в target, защищая глубокие структуры от Vue 3.
   */
  public override reactive<T extends object>(target: T, name?: string): T {
    // Вспомогательная функция для глубокого рекурсивного внедрения маркеров фреймворка
    const injectVueMarkers = (obj: any) => {
      if (!obj || typeof obj !== 'object' || Symbol.iterator in obj) return

      // 1. Внедряем мост подписки __subscribe
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

      // 2. Внедряем маркер __v_skip непосредственно в target
      // Благодаря Reflect.get в ядре, этот маркер будет возвращаться для ВСЕХ уровней вложенности графа!
      if (!Reflect.has(obj, '__v_skip')) {
        Object.defineProperty(obj, '__v_skip', {
          get: () => true,
          configurable: true,
          enumerable: false
        })
      }

      // Рекурсивно обходим все дочерние свойства, чтобы застраховать вложенные массивы и объекты
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'object') {
          injectVueMarkers(obj[key])
        }
      }
    }

    // Запускаем глубокую инжекцию маркеров во все узлы дерева target
    injectVueMarkers(target)

    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  /**
   * Использование реактивного значения во Vue-компоненте или EffectScope.
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      const state = shallowRef(item)
      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      const state = shallowRef(signalItem.value)

      const unsubscribe = signalItem.subscribe((newValue) => {
        state.value = newValue
        triggerRef(state)
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }

      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
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

    return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
  }
}

/**
 * 🤖 2. АВТОМАТИЧЕСКИЙ РЕАКТИВНЫЙ АДАПТЕР ДЛЯ VUE 3 (АСИНХРОННЫЙ ШЕДУЛЕР)
 * Наследует ReactiveEngineAutomatic и аппаратно склеивает цепочки мутаций в микрозадачи.
 */
export class ReactiveEngine4VueAutomatic extends ReactiveEngineAutomatic {
  protected override frameworkPrefix = 'vue-auto'

  /**
   * Переопределяем метод создания реактивных объектов для Vue-версии движка.
   * Рекурсивно внедряет свойства __subscribe и __v_skip в target, защищая глубокие структуры от Vue 3.
   */
  public override reactive<T extends object>(target: T, name?: string): T {
    // Вспомогательная функция для глубокого рекурсивного внедрения маркеров фреймворка
    const injectVueMarkers = (obj: any) => {
      if (!obj || typeof obj !== 'object' || Symbol.iterator in obj) return

      // 1. Внедряем мост подписки __subscribe
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

      // 2. Внедряем маркер __v_skip непосредственно в target
      // Благодаря Reflect.get в ядре, этот маркер будет возвращаться для ВСЕХ уровней вложенности графа!
      if (!Reflect.has(obj, '__v_skip')) {
        Object.defineProperty(obj, '__v_skip', {
          get: () => true,
          configurable: true,
          enumerable: false
        })
      }

      // Рекурсивно обходим все дочерние свойства, чтобы застраховать вложенные массивы и объекты
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'object') {
          injectVueMarkers(obj[key])
        }
      }
    }

    // Запускаем глубокую инжекцию маркеров во все узлы дерева target
    injectVueMarkers(target)

    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  public use<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      const state = shallowRef(item)
      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      const state = shallowRef(signalItem.value)

      const unsubscribe = signalItem.subscribe((newValue) => {
        state.value = newValue
        triggerRef(state)
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }

      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
    }

    const state = shallowRef(item)

    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      const unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        triggerRef(state) // triggerRef теперь будет вызван строго 1 раз на выходе в Event Loop
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }
    }

    return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
  }
}
