# `resource`

Метод `resource` позволяет создавать асинхронные ресурсы, которые автоматически обновляют подписанные на них зависимости при изменении данных.

## Обзор

Метод `resource` предназначен для работы с асинхронными операциями, такими как загрузка данных из сети. Он автоматически управляет состоянием загрузки, ошибок и повторных попыток выполнения запроса. Метод возвращает объект `Resource`, который предоставляет доступ к текущему состоянию ресурса и методам для управления им.

## Синтаксис

```javascript
engine.resource(fetcher, source, optionsOrName)
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **source** (`{ value: S }`): Источник данных, который зависит от сигнала или computed.

- **optionsOrName** (`string | ResourceOptions<T, S>`): Имя или опции ресурса.

## Возвращаемое значение

Метод возвращает объект `Resource`, который имеет следующие свойства и методы:

- **`data`**: Данные ресурса.
- **`loading`**: Состояние загрузки ресурса (true/false).
- **`error`**: Ошибка, если произошла ошибка при загрузке данных.
- **`isRetrying`**: Флаг, указывающий на то, происходит ли повторная попытка загрузки.
- **`value`**: Полный объект состояния ресурса (`ResourceState<T>`).
- **`refetch()`**: Метод для принудительной перезагрузки ресурса.
- **`subscribe(cb: (val: ResourceState<T>) => void)`**: Подписка на изменение состояния ресурса. Возвращает функцию для очистки подписки.

## Примеры

### Пример на чистом JavaScript

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const dataResource = engine.resource(fetchData, counter, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Запустит перезагрузку ресурса
```

### Пример с валидацией ответа

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const dataResource = engine.resource(fetchData, counter, {
  name: 'my-resource',
  responseValidate: (data) => !!data || 'Данные пусты'
});

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Запустит перезагрузку ресурса
```

### Пример с таймаутами и повторными попытками

```javascript
const engine = new ReactiveEngine();

const fetchData = async (source, signal) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
      } else {
        resolve({ data: `Fetched data for ${source}` });
      }
    }, 2000);
  });
};

const source = engine.signal('initial_source');
const resource = engine.resource(fetchData, source, {
  name: 'timeout-resource',
  timeout: 1500,
  retryCount: 2
});

resource.subscribe((state) => {
  console.log('Resource state:', state);
});

source.value = 'new_source'; // Запустит перезагрузку ресурса с новым источником
```

### Пример интеграции с React через DI контейнер

#### Вариант А: 🫤 Управление состоянием через `engine.signal` (Базовый примитивный подход)

Этот подход использует традиционные атомарные реактивные примитивы. Поскольку `signal` отслеживает изменения только на уровне корневой ссылки, изменение вложенных свойств внутри объекта требует явного переприсвоения, чтобы разбудить граф зависимостей.
```tsx
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Инициализируем атомарный сигнал, содержащий структуру объекта
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'userSignal' }
  );

  public incId = (): void => {
    // 1. Императивно мутируем вложенное свойство
    this.userSignal.value.id += 1;
    // 2. КРИТИЧЕСКИ ВАЖНО: Присваиваем значение самому себе (пинаем сеттер)
    this.userSignal.value = this.userSignal.value;
    // ☝️ Так как ссылка на объект не изменилась, мы должны вручную запустить граф
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Экземпляр синглтона, полученный через автовайринг

export function MyComponent(): React.JSX.Element {
  // Привязываем жизненный цикл компонента к узлу атомарного сигнала
  const user: UserState = engine.use<UserState>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

_Архитектурные особенности и ограничения подхода с использованием `signal`:_
- **Ручной пинг зависимостей:** Мутация вложенного свойства (например, `id`) не меняет ссылку на объект верхнего уровня. Вам всегда необходимо явно вызывать сеттер сигнала (`signal.value = signal.value`), что добавляет технический мусор в код экшенов бизнес-логики.
- **Избыточные аксессоры:** Вы вынуждены читать и записывать значения через свойство `.value` внутри методов вашего сервиса, работая со сложной структурой данных как с инкапсулированным контейнером, а не как с обычным JavaScript-объектом.

#### Вариант Б: 😉 Эквивалентный, строго типизированный пример с `reactive`

Вот как будет выглядеть ваш пример. Обратите внимание на чистоту метода `incId` — теперь это обычная мутация без технического мусора:
```tsx
import React from 'react';
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Инициализируем глубоко реактивный объект через engine.reactive
  // Типизируем как обычный объект UserState, а не как Signal<UserState>
  public userProfile: UserState = this.engine.reactive<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'user-profile-reactive' }
  );

  public incId = (): void => {
    this.userProfile.id += 1;
    // 👌 Больше никаких .value и пинков сеттера самому себе!
    // Прямая, чистая и безопасная императивная мутация
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Автоматический синглтон

export function MyComponent(): React.JSX.Element {
  // Подписываем React-компонент напрямую на реактивный прокси-объект
  const user: UserState = engine.use<UserState>(logic.userProfile);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

_Важные архитектурные отличия, которые нужно зафиксировать:_
- **Типы данных:** Свойство `userProfile` теперь имеет чистый тип `UserState` вместо `Signal<UserState>`. Это значительно упрощает интеграцию с внешними утилитами и типизацию TypeScript, так как объект выглядит как стандартный POJO (Plain Old JavaScript Object).
- **Чтение данных:** В методах класса и компонентах полностью исчезает обращение к свойству `.value`.

Этот пример идеально объясняет, в чем заключается профит использования `engine.reactive` по сравнению с базовыми `signal` при работе со сложными структурами данных.

## Дополнительная информация

Ресурсы являются важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении данных. Метод `resource` обеспечивает удобный интерфейс для работы с асинхронными операциями, управляя состоянием загрузки, ошибок и повторных попыток выполнения запроса.

## Внутреннее устройство и краевые случаи

### Инициализация ресурса

При создании ресурса метод `resource` инициализирует начальное состояние с `loading: true`, `data: null` и `error: null`. Затем он запускает асинхронную операцию загрузки данных.

### Обработка ошибок

Если при выполнении запроса возникает ошибка, метод `resource` обновляет состояние ресурса с соответствующей ошибкой. Если указаны опции валидации ответа (`responseValidate`), они будут проверены перед сохранением данных.

### Повторные попытки

Если запрос завершается с ошибкой и количество повторных попыток не исчерпано, метод `resource` автоматически запускает следующую попытку через заданное время ожидания. Время ожидания увеличивается экспоненциально.

### Таймауты

Если запрос превышает установленный таймаут, он будет прерван, и метод `resource` обновит состояние ресурса с ошибкой таймаута.

### Подписка на изменения состояния

Метод `subscribe` позволяет подписаться на изменения состояния ресурса. При каждом изменении состояния вызывается переданная функция обратного вызова, которая получает текущее состояние ресурса.

## Примеры использования

### Пример с чистым TypeScript (Базовый)

```typescript
import { ReactiveEngineCore } from './core';

interface User {
  id: number;
  name: string;
}

const engine = new ReactiveEngineCore();

const fetchData = async (source: User, signal: AbortSignal): Promise<User> => {
  // Реализация фетча пользователя
};

const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' });
const userResource = engine.resource(fetchData, { value: userSignal.value }, { name: 'userResource' });

userResource.subscribe((state) => {
  console.log('Resource state:', state);
});

userSignal.value.id++; // Запустит перезагрузку ресурса
```

### Пример с чистым TypeScript (Продвинутый)

```typescript
import { ReactiveEngineCore } from './core';

interface User {
  id: number;
  name: string;
}

const engine = new ReactiveEngineCore();

const fetchData = async (source: User, signal: AbortSignal): Promise<User> => {
  // Реализация фетча пользователя с использованием AbortSignal и timeout
};

const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' });
const userResource = engine.resource(fetchData, { value: userSignal.value }, {
  name: 'userResource',
  timeout: 5000,
  retryCount: 3,
});

userResource.subscribe((state) => {
  console.log('Resource state:', state);
});

userSignal.value.id++; // Запустит перезагрузку ресурса
```

### Пример интеграции с React (через DI контейнер)

```typescript
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface User {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  public userSignal: Signal<User> = this.engine.signal<User>(
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
  const user: User = engine.use<User>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

## Заключение

Метод `resource` предоставляет мощные возможности для работы с асинхронными операциями в реактивной системе. Он автоматически управляет состоянием загрузки, ошибок и повторных попыток выполнения запроса, что делает его идеальным инструментом для интеграции с UI-фреймворками и другими зависимостями.
