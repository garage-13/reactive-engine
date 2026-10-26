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

## Мутация объектов и защита от бесконечных циклов

При работе со сложными структурами данных (объектами или массивами) изменение внутренних свойств не приводит к автоматическому обновлению реактивного графа, так как ссылка на сам объект остается прежней. Чтобы уведомить ядро об изменениях, необходимо принудительно присвоить объект самому себе.

Однако выполнение такой операции внутри `effect`, который одновременно читает этот же сигнал, создает опасную циклическую зависимость. Движок ядра автоматически перехватывает этот паттерн с помощью внутреннего механизма отслеживания `activeConsumer` и безопасно блокирует синхронную рекурсию, предотвращая падение рантайма V8 с ошибкой переполнения стека (`Maximum call stack size exceeded`).

```typescript
import { ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface ICounterState {
  clicks: number;
  label: string;
}

const engine: ReactiveEngine = new ReactiveEngine();

// Создаем реактивный сигнал для отслеживания состояния счетчика
const counterSignal: Signal<ICounterState> = engine.signal<ICounterState>(
  { clicks: 0, label: 'Инициализация' },
  { name: 'counter-signal' }
);

// Опасная зона: создаем эффект, который порождает циклическую зависимость.
// Эффект ОДНОВРЕМЕННО читает сигнал и пишет в него же.
engine.effect((): void => {
  // 1. Читаем значение (эффект подписывается на изменения counterSignal)
  const currentClicks: number = counterSignal.value.clicks;
  console.log(`[Эффект] Реагирую на изменение. Текущие клики: ${currentClicks}`);

  // 2. Императивно мутируем состояние внутри текущего потока выполнения
  counterSignal.value.clicks += 1;
  counterSignal.value.label = `Клик №${counterSignal.value.clicks}`;

  // 3. Пинаем сеттер самому себе, чтобы спровоцировать обновление графа.
  // БЕЗ встроенной защиты ядра этот пинок вызвал бы бесконечную синхронную рекурсию
  // и мгновенно взорвал бы стек вызовов (Stack Overflow).
  counterSignal.value = counterSignal.value;
}, 'cyclic-protection-effect');

// Проверяем финальное состояние после отрабатывания барьера ядра.
// Эффект выполнился ровно 1 раз. Повторный синхронный запуск в цикле заблокирован.
console.log(`[Финал] Счетчик успешно инкрементирован один раз: ${counterSignal.value.clicks}`); // Выведет: 1
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

### Пример с кастомной валидацией

```typescript
const engine = new ReactiveEngineCore();
interface User { id: number; name: string; }
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

userSignal.value = { id: -1, name: 'Jane Doe' }; // Ошибка валидации
```

### Пример с логированием транзакций

```typescript
const engine = new ReactiveEngineCore({
  logger: {
    isEnabled: true,
    traceTime: true,
    filter: /^example-*/
  }
});

const count = engine.signal(0, { name: 'count' });
const doubledCount = engine.computed(() => count.value * 2, { name: 'doubledCount' });

count.value++; // Выведет логи о транзакции
```

### Пример с батчингом обновлений

```typescript
const engine = new ReactiveEngineCore();
const count1 = engine.signal(0);
const count2 = engine.signal(0);

engine.batch(() => {
  count1.value++;
  count2.value++;
});

console.log(count1.value); // Выведет: 1
console.log(count2.value); // Выведет: 1
```

### Пример с отслеживанием зависимостей

```typescript
const engine = new ReactiveEngineCore();
const rawSignal = engine.signal('a');

// Цепочка: Signal -> Computed A -> Computed B
const upper = engine.computed(() => rawSignal.value.toUpperCase());
const repeat = engine.computed(() => `${upper.value}${upper.value}`);

console.log(repeat.value); // Выведет: AA

// Мутируем корень графа
rawSignal.value = 'b';

// Волна инвалидации синхронно прошла по всей цепочке
console.log(repeat.value); // Выведет: BB
```

## Дополнительная информация

Вычисляемые значения являются фундаментальной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении значений зависимых сигналов.
