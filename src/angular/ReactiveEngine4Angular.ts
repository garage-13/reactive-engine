import { signal, inject, DestroyRef, Injector, runInInjectionContext, type Signal } from '@angular/core'
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core'

export interface AngularUseOptions {
  injector?: Injector;
}

// Описываем строгий контракт для примитивов реактивного ядра (Signals / Computed)
export interface ISignalLike<V> {
  readonly value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

export class ReactiveEngine4Angular extends OriginalReactiveEngine {
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
   *
   * @template T
   * @param {T} item - Реактивный объект ядра (сигнал или прокси)
   * @param {AngularUseOptions} [options] - Опции инжектора Angular
   * @returns {T extends ISignalLike<infer V> ? Signal<V> : Signal<T>} - Стандартный Angular Signal (Readonly)
   */
  public use<T>(
    item: T,
    options?: AngularUseOptions
  ): T extends ISignalLike<infer V> ? Signal<V> : Signal<T> {
    if (item === null || item === undefined || typeof item !== 'object') {
      const angularSignal = signal(item)
      return angularSignal.asReadonly() as any
    }

    // Проверяем, реализует ли переданный объект интерфейс Сигнала (наличие метода subscribe)
    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    let unsubscribe: CleanupFn = () => {}
    let angularSignal: any

    // ------------------------------------------------====
    // СЦЕНАРИЙ А: Передан примитивный Сигнал или Computed
    // ------------------------------------------------====
    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      angularSignal = signal(signalItem.value)

      unsubscribe = signalItem.subscribe(() => {
        const freshValue = signalItem.value
        angularSignal.set(freshValue)
      })
    }
    // ------------------------------------------------====
    // СЦЕНАРИЙ Б: Передан Proxy-объект из метода reactive()
    // ------------------------------------------------====
    else {
      angularSignal = signal(item)

      if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
        unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
          // При мутации свойств или массивов Proxy делаем принудительный .set()
          // для создания новой внутренней зависимости внутри экосистемы Angular Signals
          angularSignal.set({ ...item })
        })
      }
    }

    // Автоматическая очистка через DestroyRef фреймворка
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
