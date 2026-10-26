# `signal`

Метод `signal` позволяет создавать реактивные переменные, которые автоматически обновляют подписанные на них зависимости при изменении значения.

## Синтаксис

```javascript
engine.signal(initialValue, optionsOrName)
```

## Параметры

- **initialValue** (`T`): Начальное значение сигнала.
- **optionsOrName** (`string | SignalOptions<T>`): Имя или опции сигнала.

## Возвращаемое значение

Метод возвращает объект `Signal`, который имеет следующие свойства и методы:

- **`value`**: Значение сигнала.
- **`subscribe(cb: (val: T) => void)`**: Подписка на изменение значения сигнала. Возвращает функцию для очистки подписки.

## Примеры

### Пример на чистом TypeScript (Базовый)

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'counter' });

count.subscribe((newValue) => {
  console.log(`Count is now ${newValue}`);
});

count.value++; // Выведет: Count is now 1
```

### Пример на чистом TypeScript (Продвинутый с валидацией)

```typescript
interface User { id: number; name: string; }
const engine = new ReactiveEngineCore();
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

userSignal.value = { id: -1, name: 'Jane Doe' }; // Ошибка валидации
```

### Пример на чистом TypeScript (Интеграция с React через DI контейнер)

```typescript
interface User { id: number; name: string; }
class UserService {
  constructor(engine: ReactiveEngineCore) {
    this.mySignal = engine.signal<User>({ id: 1, name: 'John Doe' }, { name: 'userSignal' });
  }

  mySignal: Signal<User>;
}

const engine = new ReactiveEngineCore();
engine.provide(UserService, UserService);
const logic = engine.inject(UserService);

function MyComponent() {
  const user = useReactiveValue(logic.mySignal);
  return <div>{user.name}</div>;
}
```

## Дополнительная информация

Сигналы являются фундаментальной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении значений.

### Обработка начального значения

При создании сигнала с помощью метода `signal`, переданное начальное значение будет установлено в качестве текущего значения сигнала. Если значение изменяется, подписанные на него зависимости будут автоматически обновлены.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0);

console.log(count.value); // Выведет: 0

count.value = 1;
console.log(count.value); // Выведет: 1
```

### Пользовательская валидация значений

Метод `signal` поддерживает опциональную пользовательскую функцию валидации, которая может проверять и блокировать установку некорректных значений.

```typescript
interface User { id: number; name: string; }
const engine = new ReactiveEngineCore();
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

userSignal.value = { id: -1, name: 'Jane Doe' }; // Ошибка валидации
console.log(userSignal.value); // Выведет: { id: 1, name: 'John Doe' }
```

### Логирование транзакций

Метод `signal` автоматически регистрирует изменения значений в системе логирования реактивных операций. Это позволяет отслеживать и отладить поведение системы.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'counter' });

count.subscribe((newValue) => {
  console.log(`Count is now ${newValue}`);
});

count.value++; // Выведет: Count is now 1
```

### Группировка обновлений через `engine.batch()`

Метод `batch` позволяет группировать несколько изменений значений в одну транзакцию, что повышает производительность и предотвращает излишние обновления зависимостей.

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

### Отслеживание зависимостей

Сигналы автоматически отслеживают зависимости, которые зависят от их значений. Это позволяет эффективно обновлять только те части системы, которые действительно изменились.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0);
let doubledCount = 0;

engine.effect(() => {
  doubledCount = count.value * 2;
});

console.log(doubledCount); // Выведет: 0

count.value++;
console.log(doubledCount); // Выведет: 2
```

Эти примеры и объяснения демонстрируют основные возможности и особенности метода `signal` в реактивной системе.