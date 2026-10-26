# `effect`

Метод `effect` позволяет создавать автоматические функции, которые выполняются при изменении зависимых сигналов. Эти эффекты могут использоваться для обновления UI или других зависимостей.

## Обзор

Эффекты являются важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении значений сигналов. Метод `effect` принимает функцию-эффект и опционально метку для логирования и отладки.

## Синтаксис

```typescript
engine.effect(fn: EffectFn, label?: string): () => void;
```

## Параметры

- **fn** (`EffectFn`): Функция эффекта, которая будет выполняться при изменении зависимых сигналов.
- **label** (`string`, необязательно): Метка для логирования и отладки.

## Возвращаемое значение

Метод возвращает функцию для очистки эффекта. Вызов этой функции удаляет эффект и его подписчики.

## Примеры

### 1. Плоский пример на чистом JavaScript

```javascript
const engine = new ReactiveEngine();
const count = engine.signal(0);

engine.effect(() => {
  console.log(`Count is now ${count.value}`);
});

count.value++; // Выведет: Count is now 1
```

### 2. Продвинутый пример с валидацией и логированием

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const count = engine.signal(0, { name: 'count' });

engine.effect(() => {
  if (count.value < 0) {
    console.error('Count cannot be negative!');
  }
}, 'negativeCountCheck');

count.value = -1; // Выведет: Count cannot be negative!
```

### 3. Интеграция через DI контейнер

#### На чистом JS

```ts
class CounterService extends AbstractService {
  countSignal = engine.signal(0, { name: '=count=' });

  increment = () => {
    this.countSignal.value += 1;
  };
}

const logic = engine.inject(CounterService);

console.log(logic.countSignal.value) // Out: 0

// -- Будет упаковано в транзакцию
logic.increment()
logic.increment()
logic.increment()
// --

console.log(logic.countSignal.value) // Out: 3
```

#### В экосистеме React

```typescript
import React from 'react';
import { AbstractService, ReactiveEngineCore } from './core';

class CounterService extends AbstractService {
  public countSignal = engine.signal(0, { name: 'count' });

  public increment = (): void => {
    this.countSignal.value += 1;
  };
}

const engine = new ReactiveEngineCore();

export function MyComponent(): React.JSX.Element {
  const logic = engine.inject(CounterService); // Метод `inject` вернет стабильную ссылку
  const count = engine.use<number>(logic.countSignal);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={logic.increment}>Increment</button>
    </div>
  );
}
```

### 4. Обработка циклических зависимостей

**Архитектурная устойчивость перекрестных зависимостей** - `ReactiveEngine` демонстрирует высокую отказоустойчивость и стабильность при обработке сложных, перекрестных зависимостей между изолированными компонентами. В отличие от примитивных реактивных систем, которые уходят в бесконечный цикл при циклическом обмене данными между несколькими эффектами, ядро библиотеки гарантирует математическую сходимость графа. Распространение волны обновлений продолжается до тех пор, пока значения не стабилизируются, после чего механизм **Equality Cut-Off** (проверка идентичности данных через `Object.is`) мгновенно гасит транзакцию и останавливает вычисления, предотвращая переполнение стека.

```typescript
const engine = new ReactiveEngineCore();
const a = engine.signal(0, { name: 'a' });
const b = engine.signal(0, { name: 'b' });

engine.effect(() => {
  a.value = b.value + 1;
}, 'effectA');

engine.effect(() => {
  b.value = a.value + 1;
}, 'effectB');

a.value = 1;
// Вызовет ошибку циклической зависимости?
// (✅ Нет - эффект не будет удален, оба остаются "живыми",
// но произойдет прекращение текущей волны синхронных обновлений в конкретный момент времени)
```

## Внутреннее устройство и краевые случаи

### Инициализация эффекта

При создании эффекта он автоматически выполняется сразу после его регистрации. Если функция-эффект возвращает другую функцию, эта функция будет использована для очистки ресурсов при уничтожении эффекта.

```typescript
const cleanup = engine.effect(() => {
  console.log('Effect is running');
  return () => {
    console.log('Cleanup function called');
  };
});

cleanup(); // Вызовет очисточную функцию и удалит эффект
```

### Логирование транзакций

Если включено логирование, каждый запуск эффекта будет записан в лог с соответствующей меткой.

```typescript
const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const count = engine.signal(0, { name: 'count' });

engine.effect(() => {
  console.log(`Count is now ${count.value}`);
}, 'logEffect');

count.value++; // В логе будет записано: EFFECT logEffect Count is now 1
```

### Обработка ошибок

Если функция-эффект выбросит исключение, все оставшиеся эффекты в очереди будут немедленно очищены и помечены как чистые.

```typescript
engine.effect(() => {
  throw new Error('Something went wrong');
}, 'errorEffect');

// Все последующие эффекты в очереди будут пропущены
```

### Группировка обновлений

Обновления, вызванные внутри `engine.batch()`, будут сгруппированы и выполнены только после завершения батча.

```typescript
engine.batch(() => {
  count.value = 1;
  count.value = 2;
});

// Лог будет содержать только одно обновление: EFFECT logEffect Count is now 2
```

### Отслеживание зависимостей

Эффект автоматически отслеживает все сигналы, которые используются внутри функции-эффекта. При изменении этих сигналов эффект будет повторно выполнен.

```typescript
const engine = new ReactiveEngineCore();
const a = engine.signal(0);
const b = engine.signal(0);

engine.effect(() => {
  console.log(`Sum is ${a.value + b.value}`);
}, 'sumEffect');

// -- Будет упаковано в транзакцию
a.value = 1; // Выведет: Sum is 1
b.value = 2; // Выведет: Sum is 3
// --
```

## Примечания

- ⛔ **Замена `engine.provide(Service, Service)`**: Не используйте `engine.provide(Service, Service)`, так как это избыточно. Используйте `engine.inject(Service)` для автоматического создания синглтонов.
- **Использование `console.log()`**: Вместо тестовых утверждений используйте `console.log()` для вывода результатов и проверки состояний.
- **Асинхронные операции**: Для асинхронных операций используйте `await` внутри функции-эффекта.

Этот метод предоставляет мощный инструмент для создания реактивных эффектов, которые автоматически обновляются при изменении зависимых сигналов.
