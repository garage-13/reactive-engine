import { useState as useStateFromReact, useEffect as useEffectFromReact } from 'react'
import { ReactiveEngine as OriginalReactiveEngine, CleanupFn } from '../core/core'

export class ReactiveEngine4React extends OriginalReactiveEngine {
  // Описываем строгие типы для адаптеров React, чтобы не ломать встроенные типы React.
  private reactAdapters: {
    useState: typeof useStateFromReact;
    useEffect: typeof useEffectFromReact;
  } = {
      useState: useStateFromReact,
      useEffect: useEffectFromReact,
    };

  /**
   * Установка адаптеров React.
   * @function setReactAdapters
   * @param {Function} useState - Функция useState из React.
   * @param {Function} useEffect - Функция useEffect из React.
   * @returns {void}
   * @source
   */
  public setReactAdapters(
    useState: typeof useStateFromReact,
    useEffect: typeof useEffectFromReact
  ): void {
    this.reactAdapters = { useState, useEffect };
  }

  /**
   * Использование реактивного значения в React компоненте.
   * @template T
   * @function use
   * @param {{ value: T; subscribe: (cb: (v: T) => void) => CleanupFn }} item - Реактивный объект.
   * @returns {T} - Значение реактивного объекта.
   * @source
   */
  public use<T>(item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn }): T {
    if (!this.reactAdapters) {
      throw new Error("[React Error]: Адаптеры React не установлены. Вызовите engine.setReactAdapters(useState, useEffect).");
    }

    // NOTE: (защита) проверяем, что нам передали объект сигнала
    if (!item || typeof item.subscribe !== 'function') {
      const errorMsg = `
        [Reactive Error]: engine.use() получил некорректный объект!
        Скорее всего, вы пытаетесь подписаться на свойство сервиса, которое не было инициализировано.
        Проверьте, что в классе написано: public mySignal = this.engine.signal(...)
      `;
      console.error(errorMsg, { item });
      throw new Error(errorMsg);
    }
    const [val, setVal] = this.reactAdapters.useState(item.value);

    this.reactAdapters.useEffect(
      () => {
        return item.subscribe(setVal);
      },
      [item]
    );

    return val;
  }
}
