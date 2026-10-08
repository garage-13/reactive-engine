import { useState as useStateFromReact, useEffect as useEffectFromReact } from 'react'
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core'

export interface ISignalLike<V> {
  value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

/**
 * Класс адаптера для интеграции реактивного движка с React.
 * Предоставляет полиморфные методы для бесшовной работы с Сигналами и Proxy-объектами.
 */
export class ReactiveEngine4React extends OriginalReactiveEngine {
  protected override frameworkPrefix = 'react'

  private reactAdapters: {
    useState: typeof useStateFromReact;
    useEffect: typeof useEffectFromReact;
  } = {
      useState: useStateFromReact,
      useEffect: useEffectFromReact,
    }

  public setReactAdapters(
    useState: typeof useStateFromReact,
    useEffect: typeof useEffectFromReact
  ): void {
    this.reactAdapters = { useState, useEffect }
  }

  /**
   * Переопределяем метод создания реактивных объектов для React-версии движка.
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
              cb() // Пинаем колбэк хука React
            }, 'react-proxy-internal-subscription')
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
   * Использование реактивного значения в React-компоненте.
   * Полиморфно поддерживает как атомарные Сигналы/Computed, так и глубокие реактивные Proxy-объекты.
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
    if (!this.reactAdapters) {
      throw new Error("[React Error]: Адаптеры React не установлены. Вызовите engine.setReactAdapters(useState, useEffect).")
    }

    if (item === null || item === undefined || typeof item !== 'object') {
      return item as any
    }

    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    // 1. Сценарий А: Передан примитивный Сигнал или Computed
    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      const [val, setVal] = this.reactAdapters.useState<unknown>(signalItem.value)

      this.reactAdapters.useEffect(
        () => {
          return signalItem.subscribe(setVal)
        },
        [signalItem]
      )

      return val as (T extends ISignalLike<infer V> ? V : T)
    }

    // 2. Сценарий Б: Передан Proxy-объект из метода reactive()
    const [, forceUpdate] = this.reactAdapters.useState<unknown[]>([])

    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      this.reactAdapters.useEffect(() => {
        const unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
          forceUpdate([]) // Триггерим асинхронный авто-батчинг ререндера React
        })
        return () => unsubscribe()
      }, [item])
    }

    return item as (T extends ISignalLike<infer V> ? V : T)
  }
}
