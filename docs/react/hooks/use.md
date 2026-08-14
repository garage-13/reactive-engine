# Использование встроенного `engine.use` (для чтения и реактивного UI)

Используется внутри React-компонентов. Говорит: «Выведи значение на экран и перерисуй меня, если оно изменится».

Если вам нужно выводить значение сигнала на экран и автоматически перерисовывать компонент при его изменении, используйте встроенный метод вашего ядра. Под капотом он как раз использует подписку и `useState`.
```tsx
import React from 'react'
import { engine, counterSignal, doubleComputed } from '~/your-store'

export const CounterComponent = () => {
  // engine.use автоматически подпишется и вызовет ререндер при изменениях
  const count = engine.use(counterSignal)
  const doubleCount = engine.use(doubleComputed)

  return (
    <div>
      <h2>Счетчик: {count}</h2>
      <h3>Удвоенный счетчик: {doubleCount}</h3>

      <button onClick={() => counterSignal.value++}>+1</button>
      <button onClick={() => counterSignal.value--}>-1</button>
    </div>
  )
}
```

## Небольшое погружение в исходники

*Реализация метода `use` внутри адаптера для работы с React, импортируемого из подпакета `@pravosleva/reactive-engine/react`*

```ts
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
    throw new Error("[React Error]: Адаптеры React не установлены. Вызовите engine.setReactAdapters(useState, useEffect).")
  }

  // NOTE: (защита) проверяем, что нам передали объект сигнала
  if (!item || typeof item.subscribe !== 'function') {
    const errorMsg = `
      [Reactive Error]: engine.use() получил некорректный объект!
      Скорее всего, вы пытаетесь подписаться на свойство сервиса, которое не было инициализировано.
      Проверьте, что в классе написано: public mySignal = this.engine.signal(...)
    `
    console.error(errorMsg, { item })
    throw new Error(errorMsg)
  }
  const [val, setVal] = this.reactAdapters.useState(item.value)

  this.reactAdapters.useEffect(
    () => {
      return item.subscribe(setVal)
    },
    [item]
  )

  return val
}
```
