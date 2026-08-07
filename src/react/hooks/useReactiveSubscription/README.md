# Хук `useReactiveSubscription`

Универсальный хук для подписки на изменения Signal, Computed или Resource.

## Базовые примеры

### Пример создания реактивного объекта
```js
import React from 'react'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from './src/ReactiveEngine'

const PersonInfo = () => {
  const engine = new ReactiveEngine();
  const person = engine.reactive({ name: 'John', age: 30 })

  // Подписываемся на изменения объекта
  Object.keys(person).forEach(prop => {
    useReactiveSubscription(engine.effect(() => {
      console.log(`${prop} изменилось на ${person[prop]}`)
    }), () => {})
  })

  return (
    <div>
      <p>Имя: {person.name}</p>
      <input type="text" value={person.name} onChange={(e) => person.name = e.target.value} />
      <p>Возраст: {person.age}</p>
      <input type="number" value={person.age} onChange={(e) => person.age = Number(e.target.value)} />
    </div>
  )
}

export default PersonInfo
```

### Использование хука `useReactiveSubscription` для управления подписками
Этот хук используется, когда вам нужно отреагировать на изменение сигнала (например, вызвать уведомление или отправить метрику), но не нужно перерисовывать сам компонент.
```tsx
import React from 'react'
import { counterSignal, doubleComputed } from './your-signals'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'

export const LoggerComponent = () => {
  // Подписываемся на обычный Signal
  useReactiveSubscription(counterSignal, (value) => {
    console.log(`Сигнал изменился! Новое значение: ${value}`)
  })

  // Хук универсален — он так же легко принимает Computed
  useReactiveSubscription(doubleComputed, (value) => {
    console.warn(`Вычисляемое значение теперь: ${value}`)
  })

  return (
    <div style={{ border: '1px solid gray', padding: '10px' }}>
      <h3>Компонент-логгер (не перерисовывается при клике)</h3>
      <button onClick={() => counterSignal.value++}>
        Увеличить счетчик
      </button>
    </div>
  )
}

```

## Итоги тестирования

Тесты для хука `useReactiveSubscription` проверяют две важные вещи: правильный вызов коллбека при изменении сигнала и отсутствие лишних переподписок, если ссылка на коллбек обновилась (благодаря использованию `useRef`).
### 🔍 Что важного в этих тестах?
1. Использование `act()`: Все вызовы, которые приводят к изменению состояния или вызовам эффектов в среде тестирования React, оборачиваются в `act`.
2. Проверка `rerender()`: С помощью этой функции мы эмулируем поведение, когда родительский компонент обновляется и прокидывает в хук новые инстансы функций или объектов. Это гарантирует, что оптимизация через `useRef` в коде вашего хука написана без багов.
