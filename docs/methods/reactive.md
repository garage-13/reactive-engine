# `reactive`

Метод `reactive` создает глубоко реактивный объект (Proxy) на основе предоставленного целевого объекта или массива. В отличие от атомарных сигналов (`signal`), которые требуют доступа через `.value`, метод `reactive` позволяет работать с сложными вложенными структурами данных нативно, используя стандартный синтаксис JavaScript для чтения и прямой мутации свойств.

## Обзор

Метод `reactive` создает реактивные объекты, которые автоматически отслеживают изменения своих свойств и уведомляют подписчиков об этих изменениях. Это особенно полезно для работы с сложными данными, такими как формы или состояния приложения.

## Синтаксис

```typescript
engine.reactive(target: object | array, name?: string): Proxy
```

### Параметры

- **target:** Исходный объект или массив JavaScript для проксирования.
- **name (необязательно):** Уникальное базовое имя объекта для трассировки и фильтрации в логгере.

## Возвращает

Глубоко проксированный реактивный объект типа `T`.

## Примеры

### 1. Базовый пример

```typescript
// Инициализация в сервисе бизнес-логики:
const engine = new ReactiveEngineCore();
const form = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

// Прямая мутация в экшене (Proxy перехватит тик и запустит атомарный батчинг):
function updateAge() {
  form.user.age += 1; // Автоматический лог: SIGNAL [profile-form.user.age]
}

// Мост подписки для UI-компонентов:
const uiBridge = engine.computed(() => ({
  name: form.user.name,
  age: form.user.age
}));

console.log(uiBridge.value); // { name: 'Иван', age: 25 }
updateAge();
console.log(uiBridge.value); // { name: 'Иван', age: 26 }
```

### 2. Продвинутый пример с валидацией

```typescript
// Инициализация в сервисе бизнес-логики:
const engine = new ReactiveEngineCore();
const form = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

// Прямая мутация с валидацией:
function updateAge() {
  const newValue = form.user.age + 1;
  if (newValue > 100) {
    console.error('Возраст не может быть больше 100');
  } else {
    form.user.age = newValue; // Автоматический лог: SIGNAL [profile-form.user.age]
  }
}

// Мост подписки для UI-компонентов:
const uiBridge = engine.computed(() => ({
  name: form.user.name,
  age: form.user.age
}));

console.log(uiBridge.value); // { name: 'Иван', age: 25 }
updateAge();
console.log(uiBridge.value); // { name: 'Иван', age: 26 }
updateAge(); // Ошибка: Возраст не может быть больше 100
```

### 3. Интеграция с React через DI контейнер

```typescript
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Pure class field initialization with strict typing
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'userSignal' }
  );

  public incId = (): void => {
    this.userSignal.value.id += 1;
    this.userSignal.value = this.userSignal.value; // Ping setter for object mutations
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  // Correctly use engine.use() hook to bind reactive nodes to React lifecycle
  const user: UserState = engine.use<UserState>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

## Внутреннее устройство и краевые случаи

### Инициализация с начальным значением

При создании реактивного объекта, все его свойства автоматически оборачиваются в сигналы. Если свойство является объектом или массивом, оно также проксируется рекурсивно.

```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

console.log(state.user.name); // Иван
```

### Валидация значений

Метод `reactive` не поддерживает встроенные механизмы валидации. Однако, можно реализовать собственные проверки при мутации свойств.

```typescript
function updateAge() {
  const newValue = form.user.age + 1;
  if (newValue > 100) {
    console.error('Возраст не может быть больше 100');
  } else {
    form.user.age = newValue; // Автоматический лог: SIGNAL [profile-form.user.age]
  }
}
```

### Логирование транзакций

Логирование реактивных операций происходит автоматически при изменении значений. Можно настроить логгер для отладки.

```typescript
const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const state = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

state.user.age = 26; // Лог: SIGNAL [profile-form.user.age] 25 → 26
```

### Обработка пакетных обновлений

Метод `engine.batch()` позволяет группировать несколько мутаций в одну транзакцию, что повышает производительность и предотвращает излишние перерисовки.

```typescript
engine.batch(() => {
  state.user.age = 26;
  state.user.name = 'Алексей';
});

// Лог: SIGNAL [profile-form.user.age] 25 → 26, SIGNAL [profile-form.user.name] Иван → Алексей
```

### Отслеживание зависимостей

Зависимости отслеживаются на уровне свойств объекта. Изменение одного свойства не вызывает перерасчет других незатронутых свойств.

```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

engine.effect(() => {
  console.log(state.user.name);
});

// Лог: Иван (эффект не срабатывает)

state.user.age = 26; // Эффект не срабатывает, т.к. подписан на другое поле
state.user.name = 'Алексей'; // Лог: Алексей
```

## Примеры

### 1. Чистый TypeScript (Базовый)

```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

console.log(state.user.name); // Иван
state.user.age = 26;
console.log(state.user.age); // 26
```

### 2. Чистый TypeScript (Продвинутый с валидацией)
```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'Иван', age: 148 }
}, 'profile-form');

function updateAge() {
  const newValue = state.user.age + 1;
  if (newValue > 150) {
    console.error('Возраст не может быть больше 150');
  } else {
    state.user.age = newValue; // Автоматический лог: SIGNAL [profile-form.user.age]
  }
}

// -- Будет упаковано в транзакцию
updateAge();
updateAge();
updateAge(); // Ошибка: Возраст не может быть больше 150
// --

console.log(state.user.age); // 150
```

### Mutation & Loop Protection Example
Этот пример наглядно демонстрирует три ключевые архитектурные особенности работы проксированных объектов и транзакционного логгера в библиотеке `@pravosleva/reactive-engine`:
- Глубокая реактивность и императивные мутации вложенных структур
- Встроенный батчинг операций мутации массивов и объектов
- Автоматическое предотвращение зацикливания при пакетной записи

```typescript
// Initialization in a business logic service:
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

// Direct mutation with loop protection:
function incAge() {
  for (let i = 0; i < 10; i++) {
    state.user.age += 1;
  }
}

incAge();
console.log(state.user.age); // 35
```

### Работа с реактивными массивами

Метод `engine.reactive` позволяет императивно манипулировать массивами, автоматически отслеживая изменение их длины (`length`) и индексов элементов. Вызовы нативных методов мутации упаковываются в атомарные транзакции, исключая лишние перерисовки.

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine';

interface ITodoItem {
  id: number;
  text: string;
}

const engine: ReactiveEngine = new ReactiveEngine({ logger: { isEnabled: true } });

// 1. Создаем реактивный массив объектов
const todoList: ITodoItem[] = engine.reactive<ITodoItem[]>([
  { id: 1, text: 'Купить молоко' }
], 'todo-list-array');

// 2. Вариант подписки №1: Через стандартный engine.effect
engine.effect((): void => {
  console.log(`[Effect] Общее количество задач: ${todoList.length}`);
  if (todoList.length > 0) {
    console.log(`[Effect] Последняя задача: ${todoList[todoList.length - 1].text}`);
  }
}, 'todo-monitor-effect');

// 3. Вариант подписки №2: Прямая подписка на массив через встроенный метод __subscribe
// Он автоматически реагирует на изменение длины и состава массива
const unsubscribe: () => void = (todoList as any).__subscribe((currentLength: number): void => {
  console.log(`[__subscribe] Массив изменился! Новая длина: ${currentLength}`);
});

// 4. Императивные мутации (батчатся автоматически под капотом ядра)
function modifyTodos(): void {
  // Добавляем элементы напрямую без деструктуризации и spread-операторов
  todoList.push({ id: 2, text: 'Написать тесты для DI' });
  todoList.push({ id: 3, text: 'Обновить документацию методов' });

  // Удаляем первый элемент
  todoList.splice(0, 1);
}

// Запускаем изменения
modifyTodos();

// В консоли транзакций мы увидим ровно один срез обновлений для подписчиков,
// где длина массива станет равна 2, а состав будет: ['Написать тесты для DI', 'Обновить документацию методов']

// При необходимости отписываемся от прямого слушателя
unsubscribe();
```

### 3. Интеграция с React (через DI контейнер)

```typescript
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Pure class field initialization with strict typing
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'userSignal' }
  );

  public incId = (): void => {
    this.userSignal.value.id += 1;
    this.userSignal.value = this.userSignal.value; // Ping setter for object mutations
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  // Correctly use engine.use() hook to bind reactive nodes to React lifecycle
  const user: UserState = engine.use<UserState>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```
