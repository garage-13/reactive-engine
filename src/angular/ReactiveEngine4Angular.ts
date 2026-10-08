import { signal, inject, DestroyRef, Injector, runInInjectionContext, type Signal } from '@angular/core'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../core/core'
import { CleanupFn } from '../core/types'

export interface AngularUseOptions {
  injector?: Injector;
}

// Описываем строгий контракт для примитивов реактивного ядра (Signals / Computed)
export interface ISignalLike<V> {
  readonly value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

/**
 * 🔴 1. СИНХРОННЫЙ РЕАКТИВНЫЙ АДАПТЕР ДЛЯ ANGULAR 16+
 * Базируется на плоском синхронном Push/Pull графе ядра.
 */
export class ReactiveEngine4Angular extends ReactiveEngine {
  protected override frameworkPrefix = 'angular'

  /**
   * Переопределяем метод создания реактивных объектов для Angular-версии движка.
   * Безопасно внедряет скрытое свойство __subscribe в оригинальный граф без double-proxying.
   */
  public override reactive<T extends object>(target: T, name?: string): T {
    if (!Reflect.has(target, '__subscribe')) {
      Object.defineProperty(target, '__subscribe', {
        get: () => {
          return (cb: () => void) => {
            return this.effect(() => {
              try {
                JSON.stringify(originalProxy) // Глубокий прогрев геттеров ядра
              } catch (e) {
                Object.values(originalProxy as Record<string, unknown>)
              }
              cb() // Оповещаем Angular Signal о мутации внутренностей Proxy
            }, 'angular-proxy-internal-subscription')
          }
        },
        configurable: true,
        enumerable: false
      })
    }

    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  /**
   * Использование реактивного значения в Angular компоненте или сервисе.
   * Полиморфно поддерживает как атомарные Сигналы/Computed, так и глубокие реактивные Proxy-объекты.
   */
  public use<T>(
    item: T,
    options?: AngularUseOptions
  ): T extends ISignalLike<infer V> ? Signal<V> : Signal<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      const angularSignal = signal(item)
      return angularSignal.asReadonly() as any
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    let unsubscribe: CleanupFn = () => {}
    let angularSignal: any

    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      angularSignal = signal(signalItem.value)

      unsubscribe = signalItem.subscribe(() => {
        const freshValue = signalItem.value
        angularSignal.set(freshValue)
      })
    }
    else {
      angularSignal = signal(item)

      if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
        unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
          // При мутации свойств или массивов Proxy делаем принудительный .set()
          angularSignal.set({ ...item })
        })
      }
    }

    const registerCleanup = () => {
      const destroyRef = inject(DestroyRef)
      destroyRef.onDestroy(() => {
        unsubscribe()
      })
    }

    if (options?.injector) {
      runInInjectionContext(options.injector, registerCleanup)
    } else {
      registerCleanup()
    }

    return angularSignal.asReadonly()
  }
}

/**
 * 🤖 2. АВТОМАТИЧЕСКИЙ РЕАКТИВНЫЙ АДАПТЕР ДЛЯ ANGULAR 16+ (АСИНХРОННЫЙ ШЕДУЛЕР)
 * Наследует ReactiveEngineAutomatic и аппаратно склеивает цепочки мутаций в микрозадачи.
 */
export class ReactiveEngine4AngularAutomatic extends ReactiveEngineAutomatic {
  protected override frameworkPrefix = 'angular-auto'

  public override reactive<T extends object>(target: T, name?: string): T {
    if (!Reflect.has(target, '__subscribe')) {
      Object.defineProperty(target, '__subscribe', {
        get: () => {
          return (cb: () => void) => {
            return this.effect(() => {
              try {
                JSON.stringify(originalProxy)
              } catch (e) {
                Object.values(originalProxy as Record<string, unknown>)
              }
              cb()
            }, 'angular-auto-proxy-internal-subscription')
          }
        },
        configurable: true,
        enumerable: false
      })
    }

    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  public use<T>(
    item: T,
    options?: AngularUseOptions
  ): T extends ISignalLike<infer V> ? Signal<V> : Signal<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      const angularSignal = signal(item)
      return angularSignal.asReadonly() as any
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    let unsubscribe: CleanupFn = () => {}
    let angularSignal: any

    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      angularSignal = signal(signalItem.value)

      unsubscribe = signalItem.subscribe(() => {
        const freshValue = signalItem.value
        angularSignal.set(freshValue)
      })
    }
    else {
      angularSignal = signal(item)

      if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
        unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
          angularSignal.set({ ...item })
        })
      }
    }

    const registerCleanup = () => {
      const destroyRef = inject(DestroyRef)
      destroyRef.onDestroy(() => {
        unsubscribe()
      })
    }

    if (options?.injector) {
      runInInjectionContext(options.injector, registerCleanup)
    } else {
      registerCleanup()
    }

    return angularSignal.asReadonly()
  }
}
