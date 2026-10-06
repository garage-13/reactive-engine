# `computed`

Метод `computed` позволяет создавать вычисляемые значения, которые автоматически обновляются при изменении зависимых сигналов.

## Синтаксис

```javascript
engine.computed(fn, optionsOrName)
```

## Параметры

- **fn** (`Function`): Функция для вычисления значения.
- **optionsOrName** (`string | ComputedOptions<T>`): Имя или опции вычисляемого значения.

## Возвращаемое значение

Метод возвращает объект `Computed`, который имеет следующие свойства и методы:

- **`value`**: Значение вычисляемого значения.
- **`subscribe(cb: (val: T) => void)`**: Подписка на изменение значения вычисляемого значения. Возвращает функцию для очистки подписки.
- **`destroy()`**: Принудительное уничтожение вычисляемого значения и его эффекта для предотвращения утечек памяти.

## Примеры

### Пример на чистом JavaScript

```javascript
const engine = new ReactiveEngine();
const count = engine.signal(0);
const doubledCount = engine.computed(() => count.value * 2);

doubledCount.subscribe((newValue) => {
  console.log(`Doubled Count is now ${newValue}`);
});

count.value++; // Выведет: Doubled Count is now 2
```

### Пример на React

```jsx
import { ReactiveEngine } from '@pravosleva/reactive-engine';
import clsx from 'clsx';

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true, // Включаем логгер
    traceTime: true, // Добавляем вывод таймингов по желанию
    filter: /^example-*/ // Можно фильтровать только нужные логи
  }
});

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-100:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-100:computed:counter');

  public inc = () => {
    this.counter.value += 1;
  }
}

export const Example100 = () => {
  const logic = engine.inject(Logic);
  const counter = engine.use(logic.counter);
  const doubledCounter = engine.use(logic.doubledCounter);

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Computed</div>
      <code>{counter} | x2 = {doubledCounter}</code>
      <div className={baseClasses.catSection}>
        <button
          onClick={logic.inc}
          className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >INC</button>
      </div>
    </div>
  );
};
```

## Дополнительная информация

Вычисляемые значения являются фундаментальной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении значений зависимых сигналов.
