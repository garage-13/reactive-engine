# Хук `useReactiveValue`

Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента. Поддерживает React 18+ и ленивые фабрики без утечек памяти. Предположим, что counterSignal и doubleComputed созданы где-то в вашем приложении. Хук сам подпишется, вытащит значение наружу и будет триггерить ререндер компонента.

## Пример

```tsx
import React from 'react';
import { useReactiveValue } from './useReactiveValue';
import { counterSignal, doubleComputed } from './myState';
// Предположим, что counterSignal и doubleComputed созданы где-то в вашем приложении

export const StandaloneCounter = () => {
  // Хук сам подпишется, вытащит значение наружу и будет триггерить ререндер компонента
  const count = useReactiveValue(counterSignal);
  const doubleCount = useReactiveValue(doubleComputed);

  return (
    <div>
      <h4>Компонент на базе изолированного useReactiveValue</h4>
      <p>Обычное значение: {count}</p>
      <p>Удвоенное значение: {doubleCount}</p>

      <button onClick={() => counterSignal.value++}>Увеличить</button>
    </div>
  );
};
```
