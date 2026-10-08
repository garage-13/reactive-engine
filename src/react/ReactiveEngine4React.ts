import { useState as useStateFromReact, useEffect as useEffectFromReact } from 'react'
import { ReactiveEngine as OriginalReactiveEngine, CleanupFn } from '../core/core'

// 1. Описываем строгий контракт для примитивных Сигналов/Computed
export interface ISignalLike<V> {
  value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

/**
 * Класс адаптера для интеграции реактивного движка с React.
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
   * Использование реактивного значения в React-компоненте.
   * Поддерживает как атомарные Сигналы/Computed, так и глубокие реактивные Proxy-объекты.
   *
   * @template T
   * @param {T} item - Реактивный объект (сигнал или прокси)
   * @returns {T extends ISignalLike<infer V> ? V : T} - Развернутое значение или сам прокси-объект
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
    if (!this.reactAdapters) {
      throw new Error("[React Error]: Адаптеры React не установлены. Вызовите engine.setReactAdapters(useState, useEffect).")
    }

    const isSignal = item &&
                     typeof item === 'object' &&
                     'subscribe' in item &&
                     typeof (item as Record<string, unknown>).subscribe === 'function'

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
    if (item && typeof item === 'object') {
      const [, forceUpdate] = this.reactAdapters.useState<unknown[]>([])

      // Используем useEffect для безопасного создания подписки вне фазы рендера React,
      // но внутри эффекта мы ПРИНУДИТЕЛЬНО запускаем глубокое считывание
      // свойств объекта (прогрев графа), чтобы ядро зацепило зависимости!
      this.reactAdapters.useEffect(() => {
        const unsubscribe = this.effect(() => {
          // Ленивый глубокий проход по свойствам объекта первого уровня,
          // чтобы Proxy-геттеры (строка 618 в core.ts) гарантированно перехватили
          // этот эффект и добавили его в propsSubscribers!
          try {
            // Рекурсивно или плоско считываем ключи
            JSON.stringify(item)
          } catch (e) {
            // Защита от круговых ссылок, просто считываем ключи первого уровня
            Object.values(item as Record<string, unknown>)
          }

          // При изменении любого из этих ключей триггерим ререндер React
          forceUpdate([])
        }, 'react-use-reactive-proxy')

        return () => unsubscribe()
      }, [item])

      // Возвращаем сам прокси-объект. При чтении в JSX он будет работать нативно.
      return item as (T extends ISignalLike<infer V> ? V : T)
    }

    const errorMsg = `
      [Reactive Error]: engine.use() получил некорректный объект!
      Проверьте, что передаваемый инстанс является Сигналом или создан через engine.reactive().
    `
    console.error(errorMsg, { item })
    throw new Error(errorMsg)
  }

}
