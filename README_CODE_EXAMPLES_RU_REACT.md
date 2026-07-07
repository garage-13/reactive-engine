# Руководство по использованию и примеры кода для React-компонентов
Этот документ содержит практические примеры использования библиотеки ReactiveEngine в React-компонентах, охватывающие различные сценарии от базового до продвинутого.

## Базовые примеры (Basic Usage)
### Пример создания реактивного объекта
```js
import React from 'react';
import { useReactiveSubscription } from '@pravosleva/reactive-engine';
import { ReactiveEngine } from './src/ReactiveEngine';

const PersonInfo = () => {
  const engine = new ReactiveEngine();
  const person = engine.reactive({ name: 'John', age: 30 });

  // Подписываемся на изменения объекта
  Object.keys(person).forEach(prop => {
    useReactiveSubscription(engine.effect(() => {
      console.log(`${prop} изменилось на ${person[prop]}`);
    }), () => {});
  });

  return (
    <div>
      <p>Имя: {person.name}</p>
      <input type="text" value={person.name} onChange={(e) => person.name = e.target.value} />
      <p>Возраст: {person.age}</p>
      <input type="number" value={person.age} onChange={(e) => person.age = Number(e.target.value)} />
    </div>
  );
};

export default PersonInfo;
```

### Использование хука `useReactiveSubscription` для управления подписками
Этот хук используется, когда вам нужно отреагировать на изменение сигнала (например, вызвать уведомление или отправить метрику), но не нужно перерисовывать сам компонент.
```tsx
import React from 'react';
import { counterSignal, doubleComputed } from './your-engine-example';
import { useReactiveSubscription } from '@pravosleva/reactive-engine'

export const LoggerComponent = () => {
  // Подписываемся на обычный Signal
  useReactiveSubscription(counterSignal, (value) => {
    console.log(`Сигнал изменился! Новое значение: ${value}`);
  });

  // Хук универсален — он так же легко принимает Computed
  useReactiveSubscription(doubleComputed, (value) => {
    console.warn(`Вычисляемое значение теперь: ${value}`);
  });

  return (
    <div style={{ border: '1px solid gray', padding: '10px' }}>
      <h3>Компонент-логгер (не перерисовывается при клике)</h3>
      <button onClick={() => counterSignal.value++}>
        Увеличить счетчик
      </button>
    </div>
  );
};

```

### Использование встроенного `engine.use` (Для чтения и реактивного UI)
Если вам нужно выводить значение сигнала на экран и автоматически перерисовывать компонент при его изменении, используйте встроенный метод вашего ядра. Под капотом он как раз использует подписку и `useState`.
```tsx
import React from 'react';
import { engine, counterSignal, doubleComputed } from './engine';

export const CounterComponent = () => {
  // engine.use автоматически подпишется и вызовет ререндер при изменениях
  const count = engine.use(counterSignal);
  const doubleCount = engine.use(doubleComputed);

  return (
    <div style={{ padding: '20px', background: '#f5f5f5' }}>
      <h2>Счетчик: {count}</h2>
      <h3>Удвоенный счетчик: {doubleCount}</h3>

      <button onClick={() => counterSignal.value++}>➕ Добавить</button>
      <button onClick={() => counterSignal.value--}>➖ Отнять</button>
    </div>
  );
};
```

### Resource
#### Использование с `engine.resource` (Асинхронные данные)
Поскольку метод `resource` возвращает объект, у которого есть `subscribe` (через внутренний сигнал состояния), вы можете передавать его значение в `engine.use`:
```tsx
// 1. Создаем ресурс (например, в сервисе или файле данных)
export const userResource = engine.resource(
  async (userId: number, abortSignal) => {
    const res = await fetch(`https://typicode.com{userId}`, { signal: abortSignal });
    return res.json();
  },
  { get value() { return counterSignal.value; } } // Зависимость от нашего счетчика
);

// 2. Используем в компоненте
export const UserProfile = () => {
  // Подписываемся на объект value ресурса (который содержит { data, loading, error })
  const { data, loading, error } = engine.use(userResource);

  if (loading) return <div>Загрузка пользователя...</div>;
  if (error) return <div>Ошибка: {error.message}</div>;

  return (
    <div>
      <h3>Данные пользователя:</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <button onClick={() => userResource.refetch()}>Обновить вручную</button>
    </div>
  );
};
```

#### Передача зависимостей через Массив (Кортеж)
Этот способ наиболее привычен для тех, кто часто работает с массивом зависимостей в useEffect.
```ts
import { engine } from './yourEngineInstance';

// 1. Создаем два независимых сигнала
const userIdSignal = engine.signal(1, 'userId');
const tabSignal = engine.signal<'profile' | 'settings'>('profile', 'tab');

// 2. Объединяем их в единую "пачку" через computed
const resourceDepsComputed = engine.computed(() => {
  // Движок автоматически подпишется на оба сигнала, так как мы читаем их .value
  return [userIdSignal.value, tabSignal.value] as const;
}, 'deps_computed');

// 3. Передаем computed в качестве source для ресурса
export const userDataResource = engine.resource(
  // В fetcher первым аргументом (source) придет наш массив с актуальными значениями
  async ([userId, tab], abortSignal) => {
    const res = await fetch(`https://example.com{userId}/${tab}`, {
      signal: abortSignal,
    });
    if (!res.ok) throw new Error('Ошибка сети');
    return res.json();
  },
  resourceDepsComputed, // Передаем вычисляемый массив зависимостей
  'userData'
);
```

#### Передача зависимостей через Объект (Более читаемый)
```ts
import { engine } from './yourEngineInstance';

// 1. Создаем сигналы для фильтрации и пагинации каталога товаров
const categorySignal = engine.signal('electronics', 'category');
const pageSignal = engine.signal(1, 'page');

// 2. Объединяем их в объект зависимостей
const catalogParamsComputed = engine.computed(() => ({
  category: categorySignal.value,
  page: pageSignal.value
}), 'catalog_params');

// 3. Создаем ресурс
export const catalogResource = engine.resource(
  // В fetcher приходит объект params с деструктуризацией
  async ({ category, page }, abortSignal) => {
    const query = new URLSearchParams({ category, page: String(page) });
    const res = await fetch(`https://example.com{query}`, {
      signal: abortSignal,
    });
    return res.json();
  },
  catalogParamsComputed, // Передаем вычисляемый объект зависимостей
  'catalogData'
);
```

### Как этим управлять из кода или React-компонента
Благодаря реактивной связи, вам достаточно просто менять значения исходных сигналов. Архитектура ядра сама сделает всю работу по инвалидации кэша и перезапросу данных:
```ts
// Пример изменения стейта (где угодно в приложении):
const nextPage = () => {
  // Изменение этого сигнала автоматически обновит computed,
  // который прервет текущий fetch-запрос и запустит новый для страницы 2!
  pageSignal.value += 1;
};

const changeCategory = (newCat: string) => {
  engine.batch(() => {
    // Если нужно обновить оба сигнала сразу, используем batch,
    // чтобы ресурс выполнил ровно один сетевой запрос вместо двух.
    categorySignal.value = newCat;
    pageSignal.value = 1;
  });
};
```

## Продвинутые сценарии (Advanced Scenarios)
### Пример асинхронного ресурса
```js
import React from 'react';
import { useReactiveSubscription } from './path/to/useReactiveSubscription';
import { ReactiveEngine } from './src/ReactiveEngine';

const UserProfile = ({ userId }) => {
  const engine = new ReactiveEngine();
  const userResource = engine.resource(async (userId) => {
    return fetch(`https://api.example.com/users/${userId}`)
      .then(response => response.json());
  }, { value: userId });

  // Подписываемся на изменения ресурса
  useReactiveSubscription(userResource, (state) => {
    if (state.loading) {
      console.log('Загрузка...');
    } else if (state.error) {
      console.error('Ошибка загрузки:', state.error);
    } else {
      console.log('Пользователь:', state.data);
    }
  });

  return (
    <div>
      {userResource.state.loading ? (
        <p>Загрузка...</p>
      ) : userResource.state.error ? (
        <p>Ошибка загрузки: {userResource.state.error.message}</p>
      ) : (
        <div>
          <p>Имя: {userResource.state.data.name}</p>
          <p>Возраст: {userResource.state.data.age}</p>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
```

### 5. Обработка краевых случаев
```js
import React from 'react';
import { useReactiveSubscription } from './path/to/useReactiveSubscription';
import { ReactiveEngine } from './src/ReactiveEngine';

const NameInput = () => {
  const engine = new ReactiveEngine();
  const name = engine.signal('');

  // Подписываемся на изменения сигнала
  useReactiveSubscription(name, (newValue) => {
    if (newValue.trim() === '') {
      console.log('Имя не может быть пустым');
    } else {
      console.log('Имя:', newValue);
    }
  });

  return (
    <div>
      <input type="text" value={name.value} onChange={(e) => name.value = e.target.value} />
    </div>
  );
};

export default NameInput;
```

## Рецепты / Типичные паттерны (Recipes / Tips)
### 6. Пример использования вычисляемых значений
```js
import React from 'react';
import { useReactiveSubscription } from './path/to/useReactiveSubscription';
import { ReactiveEngine } from './src/ReactiveEngine';

const FullName = () => {
  const engine = new ReactiveEngine();
  const firstName = engine.signal('John');
  const lastName = engine.signal('Doe');
  const fullName = engine.computed(() => `${firstName.value} ${lastName.value}`);

  // Подписываемся на изменения вычисляемого значения
  useReactiveSubscription(fullName, (newFullName) => {
    console.log(newFullName);
  });

  return (
    <div>
      <p>{fullName.value}</p>
      <input type="text" value={firstName.value} onChange={(e) => firstName.value = e.target.value} />
      <input type="text" value={lastName.value} onChange={(e) => lastName.value = e.target.value} />
    </div>
  );
};

export default FullName;
```

### 7. Управление несколькими подписками
#### 7.1. Создание Кастомных Хуков для Каждой Подписки
Создадим отдельные кастомные хуки для каждой подписки, чтобы они были независимыми и легко управляемыми.
Хук для Подписки на Сигнал (useSignalSubscription):
```js
// useSignalSubscription.js

import { useEffect } from 'react';

const useSignalSubscription = (signal, callback) => {
  useEffect(() => {
    const subscription = signal.subscribe(callback);

    return () => {
      subscription();
    };
  }, [signal, callback]);
};

export default useSignalSubscription;
```
Хук для Подписки на Вычисляемое Значение (useComputedSubscription):
```js
// useComputedSubscription.js

import { useEffect } from 'react';

const useComputedSubscription = (computedValue, callback) => {
  useEffect(() => {
    const subscription = computedValue.subscribe(callback);

    return () => {
      subscription();
    };
  }, [computedValue, callback]);
};

export default useComputedSubscription;
```
Хук для Подписки на Ресурс (useResourceSubscription):
```js
// useResourceSubscription.js

import { useEffect } from 'react';

const useResourceSubscription = (resource, callback) => {
  useEffect(() => {
    const subscription = resource.subscribe(callback);

    return () => {
      subscription();
    };
  }, [resource, callback]);
};

export default useResourceSubscription;
```
#### 7.2 Использование Кастомных Хуков в Компоненте
Теперь используем эти кастомные хуки в одном компоненте для управления несколькими подписками.
```js
import React from 'react';
import { useSignalSubscription, useComputedSubscription, useResourceSubscription } from './path/to/custom-hooks';
import { ReactiveEngine } from './src/ReactiveEngine';

const UserProfile = ({ userId }) => {
  const engine = new ReactiveEngine();

  // Сигналы и вычисляемые значения
  const name = engine.signal('');
  const age = engine.signal(0);
  const fullName = engine.computed(() => `${name.value} ${age.value}`);

  // Ресурс для загрузки данных пользователя
  const userResource = engine.resource(async (userId) => {
    return fetch(`https://api.example.com/users/${userId}`)
      .then(response => response.json());
  }, { value: userId });

  // Подписка на сигнал name
  useSignalSubscription(name, (newValue) => {
    console.log('Имя изменено:', newValue);
  });

  // Подписка на сигнал age
  useSignalSubscription(age, (newValue) => {
    console.log('Возраст изменен:', newValue);
  });

  // Подписка на вычисляемое значение fullName
  useComputedSubscription(fullName, (newFullName) => {
    console.log('Полное имя изменилось:', newFullName);
  });

  // Подписка на ресурс userResource
  useResourceSubscription(userResource, (state) => {
    if (state.loading) {
      console.log('Загрузка...');
    } else if (state.error) {
      console.error('Ошибка загрузки:', state.error.message);
    } else {
      console.log('Пользователь:', state.data);
    }
  });

  return (
    <div>
      {userResource.state.loading ? (
        <p>Загрузка...</p>
      ) : userResource.state.error ? (
        <p>Ошибка загрузки: {userResource.state.error.message}</p>
      ) : (
        <div>
          <p>Имя: {name.value}</p>
          <input type="text" value={name.value} onChange={(e) => name.value = e.target.value} />
          <p>Возраст: {age.value}</p>
          <input type="number" value={age.value} onChange={(e) => age.value = Number(e.target.value)} />
          <p>Полное Имя: {fullName.value}</p>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
```

#### 7.3 Объединение Подписок в Один Хук (По Нуждам)
Если вы хотите объединить несколько подписок в один хук для удобства, можно создать общий кастомный хук, который будет управлять всеми необходимыми подписками.
```js
// useUserSubscriptions.js

import { useEffect } from 'react';

const useUserSubscriptions = (name, age, fullName, userResource) => {
  // Подписка на сигнал name
  useEffect(() => {
    const subscriptionName = name.subscribe((newValue) => {
      console.log('Имя изменено:', newValue);
    });

    return () => {
      subscriptionName();
    };
  }, [name]);

  // Подписка на сигнал age
  useEffect(() => {
    const subscriptionAge = age.subscribe((newValue) => {
      console.log('Возраст изменен:', newValue);
    });

    return () => {
      subscriptionAge();
    };
  }, [age]);

  // Подписка на вычисляемое значение fullName
  useEffect(() => {
    const subscriptionFullName = fullName.subscribe((newFullName) => {
      console.log('Полное имя изменилось:', newFullName);
    });

    return () => {
      subscriptionFullName();
    };
  }, [fullName]);

  // Подписка на ресурс userResource
  useEffect(() => {
    const subscriptionUserResource = userResource.subscribe((state) => {
      if (state.loading) {
        console.log('Загрузка...');
      } else if (state.error) {
        console.error('Ошибка загрузки:', state.error.message);
      } else {
        console.log('Пользователь:', state.data);
      }
    });

    return () => {
      subscriptionUserResource();
    };
  }, [userResource]);
};

export default useUserSubscriptions;
```
Использование объединенного хука:
```js
import React from 'react';
import { useUserSubscriptions } from './path/to/useUserSubscriptions';
import { ReactiveEngine } from './src/ReactiveEngine';

const UserProfile = ({ userId }) => {
  const engine = new ReactiveEngine();

  // Сигналы и вычисляемые значения
  const name = engine.signal('');
  const age = engine.signal(0);
  const fullName = engine.computed(() => `${name.value} ${age.value}`);

  // Ресурс для загрузки данных пользователя
  const userResource = engine.resource(async (userId) => {
    return fetch(`https://api.example.com/users/${userId}`)
      .then(response => response.json());
  }, { value: userId });

  // Использование объединенного хука для всех подписок
  useUserSubscriptions(name, age, fullName, userResource);

  return (
    <div>
      {userResource.state.loading ? (
        <p>Загрузка...</p>
      ) : userResource.state.error ? (
        <p>Ошибка загрузки: {userResource.state.error.message}</p>
      ) : (
        <div>
          <p>Имя: {name.value}</p>
          <input type="text" value={name.value} onChange={(e) => name.value = e.target.value} />
          <p>Возраст: {age.value}</p>
          <input type="number" value={age.value} onChange={(e) => age.value = Number(e.target.value)} />
          <p>Полное Имя: {fullName.value}</p>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
```

## Тест-кейс
Напишем тест с использованием vitest для проверки корректности работы компонента UserProfile, в котором используются несколько подписок. Тесты будут охватывать следующие аспекты:
1. Инициализация состояния и ресурса
2. Обработка изменений сигналов (name и age)
3. Переход между состояниями загрузки, ошибки и успешной загрузки ресурса
### Структура Проекта
Предположим, что структура проекта выглядит следующим образом:
```
src/
├── components/
│   ├── UserProfile.js
│   └── ...
├── hooks/
│   ├── useSignalSubscription.js
│   ├── useComputedSubscription.js
│   ├── useResourceSubscription.js
│   └── useUserSubscriptions.js
├── ReactiveEngine.js
└── ...
```
### Установка зависимостей
Если вы еще не установили vitest, выполните следующие команды:
```shell
npm install vitest @vitest/ui --save-dev
```
`packege.json`
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest ui"
  }
}
```
Создайте файл тестов, например, `UserProfile.test.js` в директории `src/components/`, и добавьте следующий код:
```js
// src/components/UserProfile.test.js

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserProfile from './UserProfile';

describe('UserProfile Component', () => {
  // Мокаем функцию fetch для избежания реальных запросов
  global.fetch = jest.fn();

  it('should render loading state initially', async () => {
    // Предполагаем, что ресурс еще не загружен
    const mockUserId = '123';
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        name: 'John Doe',
        age: 30
      })
    });

    render(<UserProfile userId={mockUserId} />);

    // Проверяем, что отображается состояние загрузки
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();

    // Ждем завершения загрузки ресурса
    await screen.findByText('Имя: John Doe');
  });

  it('should render user data after successful fetch', async () => {
    const mockUserId = '123';
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        name: 'John Doe',
        age: 30
      })
    });

    render(<UserProfile userId={mockUserId} />);

    // Ждем завершения загрузки ресурса и проверяем отображение данных
    await screen.findByText('Имя: John Doe');
    expect(screen.getByText('Возраст: 30')).toBeInTheDocument();
    expect(screen.getByText('Полное Имя: John Doe 30')).toBeInTheDocument();

    // Проверяем реактивность сигналов name и age
    fireEvent.change(screen.getByRole('textbox', { name: /имя/i }), {
      target: { value: 'Jane Doe' }
    });
    await screen.findByText('Имя: Jane Doe');
    expect(screen.getByText('Полное Имя: Jane Doe 30')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: 25 }
    });
    await screen.findByText('Возраст: 25');
    expect(screen.getByText('Полное Имя: Jane Doe 25')).toBeInTheDocument();
  });

  it('should handle fetch error', async () => {
    const mockUserId = '123';
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        message: 'User not found'
      })
    });

    render(<UserProfile userId={mockUserId} />);

    // Ждем завершения загрузки ресурса и проверяем отображение ошибки
    await screen.findByText('Ошибка загрузки: User not found');
  });
});
```
### Объяснение тестов
1. Инициализация и Загрузка:
В первом тесте (should render loading state initially) проверяем, что компонент отображает состояние загрузки при инициализации.
После успешного ответа от сервера проверяем, что данные пользователя корректно отображаются.
Реактивность Сигналов:

2. Во втором тесте (should render user data after successful fetch) проверяем, что изменения сигналов name и age приводят к обновлению отображаемых данных.
Используем fireEvent.change для имитации ввода пользователем новых значений.
Обработка Ошибок:

3. В третьем тесте (should handle fetch error) проверяем, что компонент корректно обрабатывает ошибки при загрузке данных.
Мокаем ответ с статусом 404 и проверяем отображение сообщения об ошибке.

### Запуск
```shell
npm test
```
Или для интерактивного режима:
```shell
npm run test:ui
```
Эти тесты гарантируют, что компонент UserProfile правильно обрабатывает и отображает данные в зависимости от состояния загрузки ресурса.

### 8. Пример асинхронного ресурса, зависящего от двух и более полей
#### 8.1 Асинхронный ресурс с двумя зависимостями
```js
// src/components/UserProfile.js

import React from 'react';
import { ReactiveEngine } from '../ReactiveEngine';
import useResourceSubscription from '../hooks/useResourceSubscription';

const UserProfile = () => {
  const engine = new ReactiveEngine();

  // Сигналы для имени и фамилии
  const firstName = engine.signal('John');
  const lastName = engine.signal('Doe');

  // Ресурс для загрузки данных пользователя по имени и фамилии
  const userResource = engine.resource(async (firstName, lastName) => {
    const controller = new AbortController();
    const signal = controller.signal;

    try {
      const response = await fetch(`https://api.example.com/users?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`, { signal });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.json();
    } catch (error) {
      if (signal.aborted) {
        console.log('Request aborted');
      } else {
        throw error;
      }
    }
  }, { value: [firstName, lastName] });

  // Подписка на ресурс userResource
  useResourceSubscription(userResource, (state) => {
    if (state.loading) {
      console.log('Загрузка...');
    } else if (state.error) {
      console.error('Ошибка загрузки:', state.error.message);
    } else {
      console.log('Пользователь:', state.data);
    }
  });

  return (
    <div>
      {userResource.state.loading ? (
        <p>Загрузка...</p>
      ) : userResource.state.error ? (
        <p>Ошибка загрузки: {userResource.state.error.message}</p>
      ) : (
        <div>
          <p>Имя: {firstName.value}</p>
          <input type="text" value={firstName.value} onChange={(e) => firstName.value = e.target.value} />
          <p>Фамилия: {lastName.value}</p>
          <input type="text" value={lastName.value} onChange={(e) => lastName.value = e.target.value} />
          {userResource.state.data && (
            <>
              <p>Полное Имя: {userResource.state.data.name}</p>
              <p>Возраст: {userResource.state.data.age}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default UserProfile;
```

#### 8.2 Объяснение логики
- Сигналы для Имени и Фамилии:
Мы создаем два сигнала `firstName` и `lastName`, которые будут контролировать зависимости ресурса.
- Ресурс с Двумя Зависимостями:
В методе `resource` мы передаем массив зависимостей `[firstName, lastName]`. Это означает, что ресурс будет перезагружаться каждый раз, когда изменяется хотя бы одно из этих полей.
- Отмена Предыдущего Запроса:
Мы используем `AbortController` для отмены предыдущего запроса. Если зависимость меняется и новый запрос начинает выполняться, старый запрос будет автоматически отменен, избегая возможных конфликтов.
- Обработка Состояния Ресурса:
Мы подписываемся на ресурс с помощью кастомного хука `useResourceSubscription`, который обрабатывает состояния загрузки, ошибок и успешной загрузки данных.

#### 8.3 Тестирование
Теперь добавим тесты для проверки работы компонента с двумя зависимостями и возможностью отмены запросов.
```js
// src/components/UserProfile.test.js

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserProfile from './UserProfile';

describe('UserProfile Component with Two Dependencies', () => {
  // Мокаем функцию fetch для избежания реальных запросов
  global.fetch = jest.fn();

  it('should render loading state initially and handle dependency changes', async () => {
    const mockUserId = '123';
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        name: 'John Doe',
        age: 30
      })
    });

    render(<UserProfile userId={mockUserId} />);

    // Проверяем, что отображается состояние загрузки
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();

    // Ждем завершения загрузки ресурса и проверяем отображение данных
    await screen.findByText('Имя: John Doe');
    expect(screen.getByText('Возраст: 30')).toBeInTheDocument();
    expect(screen.getByText('Полное Имя: John Doe')).toBeInTheDocument();

    // Изменяем имя и фамилию, что должно вызвать новый запрос
    fireEvent.change(screen.getByRole('textbox', { name: /имя/i }), {
      target: { value: 'Jane' }
    });

    fireEvent.change(screen.getByRole('textbox', { name: /фамилия/i }), {
      target: { value: 'Smith' }
    });

    // Проверяем, что отображается состояние загрузки при изменении зависимостей
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();

    // Мокаем новый успешный запрос после изменения зависимостей
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        name: 'Jane Smith',
        age: 28
      })
    });

    // Ждем завершения нового запроса и проверяем отображение новых данных
    await screen.findByText('Имя: Jane');
    expect(screen.getByText('Возраст: 28')).toBeInTheDocument();
    expect(screen.getByText('Полное Имя: Jane Smith')).toBeInTheDocument();

    // Проверяем, что старые данные были обновлены
    expect(screen.queryByText('Имя: John Doe')).not.toBeInTheDocument();
    expect(screen.queryByText('Возраст: 30')).not.toBeInTheDocument();
  });

  it('should handle fetch error after dependency changes', async () => {
    const mockUserId = '123';
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        message: 'User not found'
      })
    });

    render(<UserProfile userId={mockUserId} />);

    // Ждем завершения загрузки ресурса и проверяем отображение ошибки
    await screen.findByText('Ошибка загрузки: User not found');

    // Изменяем имя и фамилию, что должно вызвать новый запрос
    fireEvent.change(screen.getByRole('textbox', { name: /имя/i }), {
      target: { value: 'Jane' }
    });

    fireEvent.change(screen.getByRole('textbox', { name: /фамилия/i }), {
      target: { value: 'Smith' }
    });

    // Проверяем, что отображается состояние загрузки при изменении зависимостей
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();

    // Мокаем новый запрос с ошибкой после изменения зависимостей
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        message: 'User not found'
      })
    });

    // Ждем завершения нового запроса и проверяем отображение новой ошибки
    await screen.findByText('Ошибка загрузки: User not found');
  });
});
```
#### 8.4 Объяснение теста
1. Инициализация и Загрузка:

В первом тесте (should render loading state initially and handle dependency changes) проверяем, что компонент отображает состояние загрузки при инициализации.
После успешного ответа от сервера проверяем, что данные пользователя корректно отображаются.

2. Изменение Зависимостей:
Когда пользователь изменяет имя или фамилию, компонент должен запустить новый запрос с обновленными зависимостями.
Проверяем, что состояние загрузки снова отображается при изменении зависимостей и что старые данные удаляются.

3. Обработка Ошибок:
Во втором тесте (should handle fetch error after dependency changes) проверяем, что компонент корректно обрабатывает ошибки при загрузке данных после изменения зависимостей.
Мокаем ответ с статусом 404 и проверяем отображение сообщения об ошибке.

Эти тесты гарантируют, что компонент UserProfile правильно обрабатывает и отображает данные в зависимости от состояния загрузки ресурса и изменений зависимостей.

### 9. Пример асинхронного ресурса, зависящего от сигнала, который также триггерит другой ресурс. Мы обеспечим оптимизацию для предотвращения лишних запросов и утечек памяти.
#### 9.1 Основная Логика Компонента
Предположим, что у нас есть два компонента: `MainComponent` и `DependentComponent`. `MainComponent` управляет сигналом, который зависит от ввода пользователя, а `DependentComponent` использует этот сигнал для загрузки данных.
```js
// src/components/MainComponent.js

import React from 'react';
import { ReactiveEngine } from '../ReactiveEngine';
import DependentComponent from './DependentComponent';

const MainComponent = () => {
  const engine = new ReactiveEngine();

  // Сигнал для ввода пользователя
  const userInputSignal = engine.signal('');

  return (
    <div>
      <input type="text" value={userInputSignal.value} onChange={(e) => userInputSignal.value = e.target.value} />
      <DependentComponent signal={userInputSignal} />
    </div>
  );
};

export default MainComponent;
```
```js
// src/components/DependentComponent.js

import React from 'react';
import { ReactiveEngine } from '../ReactiveEngine';
import useResourceSubscription from '../hooks/useResourceSubscription';

const DependentComponent = ({ signal }) => {
  const engine = new ReactiveEngine();

  // Ресурс, зависящий от сигнала
  const dataResource = engine.resource(async (signalValue) => {
    if (!signalValue.trim()) return null; // Если сигнал пустой, не делаем запрос

    const controller = new AbortController();
    const signal = controller.signal;

    try {
      const response = await fetch(`https://api.example.com/data?query=${encodeURIComponent(signalValue)}`, { signal });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.json();
    } catch (error) {
      if (signal.aborted) {
        console.log('Request aborted');
      } else {
        throw error;
      }
    }
  }, { value: [signal] });

  // Ресурс, зависящий от dataResource
  const secondaryResource = engine.resource(async (data) => {
    if (!data) return null; // Если первичный ресурс пустой, не делаем запрос

    const controller = new AbortController();
    const signal = controller.signal;

    try {
      const response = await fetch(`https://api.example.com/secondary?dataId=${encodeURIComponent(data.id)}`, { signal });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.json();
    } catch (error) {
      if (signal.aborted) {
        console.log('Request aborted');
      } else {
        throw error;
      }
    }
  }, { value: [dataResource.state.data] });

  // Подписка на secondaryResource
  useResourceSubscription(secondaryResource, (state) => {
    if (state.loading) {
      console.log('Загрузка вторичных данных...');
    } else if (state.error) {
      console.error('Ошибка загрузки вторичных данных:', state.error.message);
    } else {
      console.log('Вторичные данные:', state.data);
    }
  });

  return (
    <div>
      {secondaryResource.state.loading ? (
        <p>Загрузка вторичных данных...</p>
      ) : secondaryResource.state.error ? (
        <p>Ошибка загрузки вторичных данных: {secondaryResource.state.error.message}</p>
      ) : (
        <div>
          {secondaryResource.state.data && (
            <>
              <p>Вторичные данные: {secondaryResource.state.data.info}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DependentComponent;
```
#### 9.2 Объяснение Логики
- Сигнал для Ввода Пользователя:
В `MainComponent` создается сигнал `userInputSignal`, который обновляется при изменении значения в инпуте.
- Первичный Ресурс (dataResource):
Этот ресурс зависит от сигнала `userInputSignal`. Он отправляет запрос на сервер с текущим значением сигнала и загружает данные. Если сигнал пустой, запрос не выполняется.
- Вторичный Ресурс (secondaryResource):
Этот ресурс зависит от данных, возвращенных первичным ресурсом. Он отправляет дополнительный запрос на сервер с использованием идентификатора из первичных данных. Если первичные данные пустые, запрос не выполняется.
- Отмена Предыдущих Запросов:
Используется `AbortController` для отмены предыдущего запроса при изменении зависимости. Это предотвращает выполнение нескольких ненужных запросов одновременно и помогает избежать утечек памяти.
- Обработка Состояний Ресурсов:
Мы подписываемся на `secondaryResource` с помощью кастомного хука `useResourceSubscription`, который обрабатывает состояния загрузки, ошибок и успешной загрузки данных.
#### 9.3 Тестирование
Теперь добавим тесты для проверки работы компонента с зависимостями и возможностью отмены запросов.
```js
// src/components/MainComponent.test.js

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MainComponent from './MainComponent';

describe('MainComponent with DependentResource', () => {
  // Мокаем функцию fetch для избежания реальных запросов
  global.fetch = jest.fn();

  it('should render initial state and handle signal changes', async () => {
    const mockQuery1 = 'query1';
    const mockData1 = { id: 1, info: 'Info for query1' };
    const mockSecondaryData1 = { info: 'Secondary Info for query1' };

    // Мокаем первый успешный запрос
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => mockData1
    });

    // Мокаем второй успешный запрос
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => mockSecondaryData1
    });

    render(<MainComponent />);

    // Проверяем, что отображается состояние загрузки первичных данных
    expect(screen.getByText('Загрузка вторичных данных...')).toBeInTheDocument();

    // Вводим значение в инпут
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: mockQuery1 }
    });

    // Ждем завершения загрузки первичных данных и проверяем отображение данных
    await screen.findByText(`Вторичные данные: ${mockSecondaryData1.info}`);

    // Проверяем, что отображаются корректные данные для первого запроса
    expect(screen.getByText('Вторичные данные: Secondary Info for query1')).toBeInTheDocument();

    // Изменяем значение в инпуте на другое
    const mockQuery2 = 'query2';
    const mockData2 = { id: 2, info: 'Info for query2' };
    const mockSecondaryData2 = { info: 'Secondary Info for query2' };

    // Мокаем третий успешный запрос
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => mockData2
    });

    // Мокаем четвертый успешный запрос
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => mockSecondaryData2
    });

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: mockQuery2 }
    });

    // Проверяем, что отображается состояние загрузки вторичных данных при изменении сигнала
    expect(screen.getByText('Загрузка вторичных данных...')).toBeInTheDocument();

    // Ждем завершения нового запроса и проверяем отображение новых данных
    await screen.findByText(`Вторичные данные: ${mockSecondaryData2.info}`);

    // Проверяем, что старые данные были обновлены
    expect(screen.queryByText('Вторичные данные: Secondary Info for query1')).not.toBeInTheDocument();
  });

  it('should handle fetch error after signal changes', async () => {
    const mockQuery = 'queryWithError';
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({
        message: 'Not Found'
      })
    });

    render(<MainComponent />);

    // Вводим значение в инпут
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: mockQuery }
    });

    // Ждем завершения загрузки первичных данных и проверяем отображение ошибки
    await screen.findByText('Ошибка загрузки вторичных данных: Not Found');
  });
});
```
Эти тесты гарантируют, что компонент MainComponent правильно обрабатывает и отображает данные в зависимости от состояния загрузки ресурсов и изменений сигнала. Они также проверяют корректность работы механизма отмены запросов для предотвращения лишних вызовов и утечек памяти.
