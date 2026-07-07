# 🚀 ReactiveEngine (Инструкция на русском 🇷🇺)
Минималистичный реактивный движок на TypeScript с Dependency Injection и интеграцией для React.

```bash
yarn add @pravosleva/reactive-engine
```

https://t.me/bash_exp_ru/3393

# @pravosleva/reactive-engine 🚀

Легковесный, ультра-производительный и независимый реактивный движок на базе сигналов (Signals) и прозрачного отслеживания зависимостей для React и TypeScript приложений.

---

## ⚡ Почему этот подход производительный?

В отличие от классического State Management в React (через Context API или глобальные сторы на иммутабельности), `@pravosleva/reactive-engine` работает по принципу **мелкогранулярных обновлений (Fine-grained reactivity)**:

* **Минимум ререндеров:** Компоненты подписываются не на «весь объект состояния», а строго на конкретные примитивные сигналы (`Signal`) или вычисляемые свойства (`Computed`), которые они выводят на экран. Изменение одного сигнала обновляет *только* тот компонент, который его читает.
* **O(1) вычисления:** `Computed` свойства ленивы. Они не пересчитываются, пока не изменятся исходные сигналы.
* **Автоматический Batching:** Движок умеет собирать множественные изменения сигналов в «пакеты» через микрозадачи. Сетевые ресурсы или тяжелые эффекты не будут перезапускаться 10 раз подряд при обновлении 10 сигналов в одном цикле.
* **Умная асинхронность:** Инструмент `resource` из коробки оркеструет `AbortController`, автоматически отменяя предыдущие зависшие сетевые запросы при изменении зависимостей.

---

## 📦 Установка

Установите пакет через ваш любимый менеджер пакетов:

```bash
npm install @pravosleva/reactive-engine
# или
yarn add @pravosleva/reactive-engine
# или
pnpm add @pravosleva/reactive-engine
```

---

## 🛠️ Базовые примеры

### 1. Создание инстанса движка и сигналов

Вы можете объявлять реактивное состояние в чистых TypeScript/JavaScript файлах вне иерархии React-компонентов.

```ts
// store.ts
import { ReactiveEngine } from '@pravosleva/reactive-engine';

export const engine = new ReactiveEngine();

// Простой сигнал (State)
export const counterSignal = engine.signal(0, 'counter');

// Вычисляемое свойство (Derivatives)
export const doubleComputed = engine.computed(
  () => counterSignal.value * 2,
  'double_counter'
);
```

### 2. Использование в React-компонентах

Для интеграции с React 18+ используйте производительный хук `useReactiveValue` (на базе `useSyncExternalStore`), а для версий React 16.8+ — хук `useReactiveValue0`.

```tsx
// Counter.tsx
import React from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { counterSignal, doubleComputed } from './store';

export const Counter = () => {
  // Хук автоматически подпишется на изменения и вызовет ререндер
  const count = useReactiveValue(counterSignal);
  const doubleCount = useReactiveValue(doubleComputed);

  return (
    <div style={{ padding: 20 }}>
      <h3>Счетчик: {count}</h3>
      <p>Удвоенное значение: {doubleCount}</p>

      <button onClick={() => counterSignal.value++}>Увеличить</button>
      <button onClick={() => counterSignal.value--}>Уменьшить</button>
    </div>
  );
};
```

---

## 🔥 Продвинутые примеры

### 1. Асинхронные ресурсы с зависимостями от нескольких сигналов

Если ваш сетевой запрос зависит от фильтров, пагинации или ID пользователя, объедините их в `computed`, чтобы `resource` автоматически перезапускал fetch-логику и отменял прошлые запросы.

```ts
// apiStore.ts
import { engine } from './store';

export const userIdSignal = engine.signal(1, 'userId');
export const tabSignal = engine.signal<'posts' | 'todos'>('posts', 'tab');

// Объединяем сигналы в единый вычисляемый массив зависимостей
const requestDeps = engine.computed(() => {
  return [userIdSignal.value, tabSignal.value] as const;
});

// Создаем реактивный асинхронный ресурс
export const userDataResource = engine.resource(
  async ([userId, tab], abortSignal) => {
    const res = await fetch(`https://typicode.com{userId}/${tab}`, {
      signal: abortSignal, // Передаем нативный токен отмены
    });
    if (!res.ok) throw new Error('Ошибка при загрузке данных');
    return res.json();
  },
  requestDeps, // Передаем зависимости
  'userData'
);
```

В компоненте это выглядит максимально декларативно:

```tsx
// UserProfile.tsx
import React from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { userIdSignal, tabSignal, userDataResource } from './apiStore';

export const UserProfile = () => {
  // Читаем объект состояния ресурса: { data, loading, error }
  const { data, loading, error } = useReactiveValue(userDataResource);
  const tab = useReactiveValue(tabSignal);

  return (
    <div>
      <div>
        <button onClick={() => { tabSignal.value = 'posts'; }}>Вкладка Посты</button>
        <button onClick={() => { tabSignal.value = 'todos'; }}>Вкладка Задачи</button>
        <button onClick={() => { userIdSignal.value += 1; }}>Следующий пользователь</button>
      </div>

      <hr />
      <h4>Текущая вкладка: {tab}</h4>

      {loading && <p>Загрузка данных по сети...</p>}
      {error && <p style={{ color: 'red' }}>Произошла ошибка: {error.message}</p>}
      {data && <pre>{JSON.stringify(data.slice(0, 3), null, 2)}</pre>}
    </div>
  );
};
```

### 2. Оптимизация через пакетные обновления (Batching)

Если вам нужно обновить сразу несколько связанных сигналов, оберните их в метод `batch`. Вместо двух сетевых запросов и двух цепочек ререндеров выполнится ровно **один**:

```ts
import { engine, userIdSignal, tabSignal } from './apiStore';

const resetUserToDefault = () => {
  engine.batch(() => {
    userIdSignal.value = 1;
    tabSignal.value = 'posts';
    // Наш ресурс userDataResource перезапустится всего 1 раз!
  });
};
```

### 3. Кэширование запросов с поддержкой времени жизни (TTL)

Вы можете использовать утилиты-декораторы для кэширования ответов сервера, чтобы при частом переключении вкладок не спамить сеть повторными запросами.

```ts
import { engine } from './store';
import { withCache } from './decorators/withCache'; // Ваша утилита сache

const searchSignal = engine.signal('', 'search');

export const cachedSearchResource = engine.resource(
  withCache(
    async (query, abortSignal) => {
      const res = await fetch(`https://example.com{query}`, { signal: abortSignal });
      return res.json();
    },
    { ttl: 30 * 1000 } // Кэш будет валиден 30 секунд для каждого уникального query
  ),
  searchSignal
);
```

## 📂 Рекомендуемая структура папок

Так как `@pravosleva/reactive-engine` позволяет объявлять состояние в чистых `.ts` файлах независимо от React, архитектура вашего приложения становится гибкой. Вот два проверенных варианта организации реактивного стейта:

### Вариант 1. Традиционный (Централизованный стейт)
Подходит для небольших и средних приложений. Все сигналы и ресурсы группируются по бизнес-логике в единой папке `store/` на верхнем уровне.

```text
src/
├── decorators/          # Кастомные обертки (например, withCache.ts)
├── store/               # Глобальное реактивное состояние приложения
│   ├── index.ts         # Инициализация движка (new ReactiveEngine())
│   ├── auth.store.ts    # Сигналы авторизации, токенов и прав
│   └── products.store.ts# Сигналы каталога, корзины и ресурсов API
├── components/          # Общие UI компоненты (вызывают useReactiveValue)
└── App.tsx
```

### Вариант 2. Feature-Driven Development / FSD (Децентрализованный стейт)
Идеально для крупных проектов и монорепозиториев. Реактивное состояние делится на слои и изолируется внутри конкретных фич (Features) или сущностей (Entities) в их собственных модулях `model`.

```text
src/
├── app/                 # Инициализация приложения и глобальный ReactiveEngine
│   └── store.ts         # Экспорт единого инстанса engine
├── features/            # Интерактивные фичи приложения
│   ├── auth-by-username/
│   │   ├── model/       # Изолированный стейт конкретной фичи
│   │   │   └── login.store.ts # Сигналы полей ввода, ошибок валидации
│   │   └── ui/          # Компоненты формы авторизации
│   └── product-catalog/
│       ├── model/       # Ресурсы пагинации, фильтров и сортировки
│       │   └── catalog.store.ts
│       └── ui/          # Сетка товаров и фильтры
```

### 3. Реакции и побочные эффекты через `useReactiveSubscription`

Иногда вам нужно просто **отреагировать** на изменение сигнала (например, запустить анимацию, вызвать уведомление или отправить метрику в аналитику), но при этом **не нужно перерисовывать сам компонент**. Для этого используется хук подписки.

#### Простой пример: Логирование изменений
Компонент ниже вообще не будет делать ререндер при кликах, но эффект внутри хука отработает на каждое изменение сигнала.

```tsx
import React from 'react';
import { useReactiveSubscription } from '@pravosleva/reactive-engine';
import { counterSignal } from './store';

export const LoggerButton = () => {
  // Хук изолирован от рендеров. Он просто выполнит коллбек при изменении сигнала
  useReactiveSubscription(counterSignal, (newValue) => {
    console.log(`[Фидбек] Счетчик изменился на: ${newValue}`);
  });

  return (
    <button onClick={() => counterSignal.value++}>
      Кликни меня (Компонент не рендерится, но лог идет)
    </button>
  );
};
```

#### Продвинутый пример: Синхронизация с императивными API браузера
Хук идеально подходит для интеграции реактивного стейта со сторонними библиотеками, холстами (`<canvas>`), картами или нативными API браузера (например, тостами, медиа-плеерами или `localStorage`).

```tsx
// store.ts
export const isMutedSignal = engine.signal(false, 'isMuted');
```

```tsx
// AudioPlayer.tsx
import React, { useRef } from 'react';
import { useReactiveSubscription } from '@pravosleva/reactive-engine';
import { isMutedSignal } from './store';

export const AudioPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Синхронизируем реактивное состояние со свойством нативного DOM-узла
  useReactiveSubscription(isMutedSignal, (isMuted) => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  });

  return (
    <div>
      <video ref={videoRef} src="video.mp4" controls />
      <button onClick={() => { isMutedSignal.value = !isMutedSignal.value; }}>
        Переключить звук
      </button>
    </div>
  );
};
```

Таким образом, библиотека предоставляет полный цикл управления потоком данных: `State (Signal) -> Derivatives (Computed) -> UI (useReactiveValue) -> Reactions (useReactiveSubscription)`

## ⚠️ Возможные проблемы и их решение (Troubleshooting)

Поскольку `@pravosleva/reactive-engine` выполняет отслеживание зависимостей «на лету» (runtime dependency tracking) через Proxy и сигналы, важно знать несколько правил, чтобы избежать скрытых багов:

### 1. Потеря реактивности при деструктуризации (Destructuring Loss)
Объекты, обернутые в `engine.reactive()`, являются JavaScript Proxy. Движок перехватывает обращение к свойствам, чтобы понять, какой компонент или эффект от них зависит.
* **Как делать НЕ надо:** Разбирать прокси-объект через деструктуризацию на верхнем уровне компонента.
  ```ts
  const user = engine.reactive({ name: 'Ivan', age: 30 });
  const { name } = user; // ❌ РЕАКТИВНОСТЬ ПОТЕРЯНА! Переменная name больше не связана с Proxy
  ```
* **Как надо:** Обращаться к свойствам объекта напрямую в месте их использования (в JSX или эффекте): `user.name`.

### 2. Бесконечные циклы в эффектах (Infinite Loops)
Если внутри `engine.effect` или `engine.computed` вы одновременно читаете сигнал и записываете в него новое значение, это вызовет бесконечный цикл обновлений и перегрузку вызовов (Maximum call stack size exceeded).
* **Решение:** Используйте встроенный метод `engine.untrack()`, чтобы временно отключить сборщик зависимостей на время записи данных:
  ```ts
  engine.effect(() => {
    const current = counterSignal.value; // Читаем и подписываемся
    engine.untrack(() => {
      counterSignal.value = current + 1; // ✅ Безопасная запись без циклов
    });
  });
  ```

### 3. Утечки памяти вне компонентов React
Хуки `useReactiveValue` и `useReactiveSubscription` автоматически отписываются от сигналов при размонтировании компонентов. Однако, если вы вручную вызываете `engine.effect()` внутри долгоживущих сервисов или классов, движок будет хранить их в памяти вечно.
* **Решение:** Всегда сохраняйте возвращаемую функцию очистки и вызывайте её, когда сервис или модуль уничтожается:
  ```ts
  const unsubscribe = engine.effect(() => { ... });
  // При уничтожении модуля:
  unsubscribe();
  ```

### 4. Сложные объекты в зависимостях `withCache`
Декоратор `withCache` сериализует аргументы `source` через `JSON.stringify()` для создания ключа кэша.
* **Ограничение:** Не передавайте в качестве зависимостей ресурса объекты с циклическими ссылками, функции или сложные экземпляры классов (например, `Map`, `Set`, `Date`). Используйте только плоские объекты, массивы или примитивы.

---

## 🗂️ Лицензия

MIT © Pravosleva

# OLD Doc (WIP)
## PERF
Для сравнения ReactiveEngine с Redux нужно оценивать их в двух плоскостях: алгоритмическая сложность (как работает код) и производительность в браузере (как часто обновляется UI).
Движок ReactiveEngine по своей природе ближе к MobX или Vue, поэтому он архитектурно отличается от Redux.
Вот основные критерии и способы сравнения:

### 1. Механика обновлений (Push vs Pull)
- Redux (Глобальный вещатель): Когда происходит dispatch, Redux уведомляет все подключенные компоненты. Каждый компонент должен запустить selector, чтобы понять, изменились ли его данные. Если селекторов сотни, это может тормозить основной поток.
- ReactiveEngine (Точечные подписки): Благодаря signal и Proxy, движок ReactiveEngine знает точно, какой компонент зависит от какого поля. Обновляется только тот компонент, чьи данные реально изменились.
**Результат:** На огромных деревьях объектов движок ReactiveEngine будет быстрее "из коробки" без мемоизации (useMemo, reselect).

### 2. Как замерить на практике?
А. Инструменты (Chrome DevTools)
1. Откройте вкладку Performance в браузере.
2. Запустите запись.
3. Выполните массовое обновление (например, измени 1000 элементов списка).
4. Смотри на параметр Scripting (сколько времени JS считал изменения) и Rendering (сколько времени React перерисовывал их).

Б. Тест "1000 счетчиков"
Создайте страницу с 1000 независимых компонентов-счетчиков.
- **В Redux**: При изменении одного счетчика проверку пройдут все 1000 селекторов.
- **В ReactiveEngine**: Сработает только 1 подписка.
- Замерьте FPS (кадры в секунду) при частом нажатии на кнопку.

### 3. Сравнение "на бумаге"

| Критерий | Redux | ReactiveEngine |
| -------- | -------- | -------- |
| Сложность обновления | O(N), где N - кол-во подписчиков | O(K), где K - кол-во реально изменившихся полей |
| Память | Низкая (простые объекты) | Чуть выше (из-за хранения объектов Proxy и Set подписчиков) |
| Масштабируемость | Требует ручной оптимизации | Масштабируется автоматически |

### 4. Где Redux может выиграть?
Redux использует обычные JS-объекты. Движок **ReactiveEngine** использует Proxy. Чтение данных через Proxy на доли наносекунд медленнее, чем чтение из обычного объекта. Если Вам нужно совершить 1 000 000 математических операций над данными в секунду, Redux (точнее, чистый JS) будет быстрее. Но в контексте UI-фреймворка эти задержки незаметны.

## Итог
Движок **ReactiveEngine** будет эффективнее в приложениях с высокой частотой обновлений (чаты, трейдинговые графики, игры), так как он избавляет React от лишней работы по сравнению данных (diffing).

## Экземпляр engine на примере, который я использую
`~/utils/engine.ts`
```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { useState, useEffect } from 'react'

// Создаем единственный экземпляр движка на все приложение
const engine = new ReactiveEngine()

// Обязательно передаем хуки React для работы engine.use()
engine.setReactAdapters(useState, useEffect)

// Дальше можно регистрировать логгеры, DevTools и сервисы
if (process.env.NODE_ENV === 'development') {
  engine.onSignalChange = (name, next, prev) => {
    console.groupCollapsed(
      `%cИзменение%c %c${name}%c`,
      name !== 'unnamed_signal' ? 'color: #888; font-weight: lighter;' : 'color: #505050; font-weight: lighter;',
      '',
      name !== 'unnamed_signal' ? 'color: #2196F3; font-weight: bold;' : 'color: #155f9b; font-weight: bold;',
    );
    console.log("%cБыло:", "color: #9e9e9e;", prev);
    console.log("%cСтало:", "color: #4CAF50; font-weight: bold;", next);
    console.groupEnd();
  };
}

export { engine }

/* NOTE: Это классический паттерн Singleton (одиночка), и для реактивного движка это самый правильный подход.
Вот несколько причин, почему один экземпляр engine — это стандарт:
1. Единое пространство состояний
Если ты создашь два engine, то сервис, зарегистрированный в первом, не сможет «увидеть» сигналы из второго. Один экземпляр гарантирует, что все части приложения (UI, сетевые запросы, логика) общаются на одном «языке» и через одну шину событий.
2. Dependency Injection (DI) работает корректно
Метод engine.inject(CounterStore) внутри хранит кэш созданных сервисов (Map). Если экземпляр один, то в любом месте приложения, вызвав inject, ты получишь один и тот же объект стора. Это позволяет легко передавать данные между компонентами, которые находятся в разных частях дерева.
3. Интеграция с DevTools и Middleware
Логгер или DevTools подключаются к конкретному экземпляру. Если их будет много, тебе придется подключать отладчик к каждому отдельно, что превратит консоль в хаос.
*/

/* NOTE: Маленький совет по импорту:
Поскольку ты теперь импортируешь engine везде,
убедись, что у тебя нет циклических зависимостей.
- Плохо: engine.ts импортирует StoreA, а StoreA импортирует engine.
- Хорошо: StoreA импортирует только типы или сам ReactiveEngine как класс для конструктора,
а экземпляр engine используется уже в компонентах или при запуске приложения.
*/
```

## Пример простого чатика (клиентская часть с использованием socket.io)
`~/services/SimpleChat/Logic.socket.io.ts`
```ts
import { io, Socket } from 'socket.io-client';
import { BaseREServiceEnhanced } from '@pravosleva/reactive-engine';
import { ChatMessage } from './types';

export class Logic extends BaseREServiceEnhanced {
  public messages = this.engine.signal<ChatMessage[]>([], 'SimpleChatService:socket.io:signal:messages');
  public status = this.engine.signal<'connecting' | 'open' | 'closed'>('closed', 'SimpleChatService:socket.io:signal:connection');

  // Сигнал текущей комнаты. Изменение этого сигнала вызовет перезапуск эффекта.
  public currentRoom = this.engine.signal<string>('general', 'SimpleChatService:socket.io:signal:room');

  private socket?: Socket;

  // Список имен пользователей, которые сейчас печатают
  public typingUsers = this.engine.signal<string[]>([], 'SimpleChatService:socket.io:signal:typingUsers');

  // Храним таймеры для каждого печатающего пользователя, чтобы удалять их по истечении времени
  private typingTimeouts = new Map<string, any>();
  private lastTypingSent = 0;

  protected onInit() {
    this.engine.effect(() => {
      // Если сигнал еще не определен, просто выходим из эффекта
      // if (!this.currentRoom) return;

      // Подписываемся на изменение комнаты
      const room = this.currentRoom.value;
      const url = 'ws://your-socket-server.ru';

      this.status.value = 'connecting';
      this.messages.value = []; // Очищаем чат при смене комнаты

      const socket = io(url, { reconnectionAttempts: 100 });
      this.socket = socket;

      socket.on('connect', () => {
        this.status.value = 'open';
        // Сообщаем серверу, что мы вошли в конкретную комнату
        socket.emit('join_room', room);
        console.log(`📡 Joined room: ${room}`);
      });

      // Слушаем сообщения именно для этой комнаты
      socket.on('room_message', (data: ChatMessage) => {
        this.messages.value = [...this.messages.value, data];
      });
      socket.on('from-client:mx:experimental-metrix:pong-ok', (data: ChatMessage) => {
        this.messages.value = [...this.messages.value, data];
      });

      socket.on('disconnect', () => {
        this.status.value = 'closed';
      });

      // 1. Слушаем событие начала печати от других
      socket.on('user_typing', (userName: string) => {
        this.handleRemoteTyping(userName);
      });

      // Очистка при смене комнаты или уничтожении сервиса
      return () => {
        socket.emit('leave_room', room);
        socket.close();
        this.socket = undefined;
      };
    });
  }

  // Обработка входящего события "печатает..."
  private handleRemoteTyping(userName: string) {
    // Если пользователь уже в списке, сбрасываем старый таймер удаления
    if (this.typingTimeouts.has(userName)) {
      clearTimeout(this.typingTimeouts.get(userName));
    } else {
      // Добавляем в список, если его там нет
      this.typingUsers.value = [...this.typingUsers.value, userName];
    }

    // Через 3 секунды удаляем пользователя из списка "печатающих"
    const timeout = setTimeout(() => {
      this.typingUsers.value = this.typingUsers.value.filter(u => u !== userName);
      this.typingTimeouts.delete(userName);
    }, 3000);

    this.typingTimeouts.set(userName, timeout);
  }

  // Метод для смены комнаты из UI
  public switchRoom(roomName: string) {
    this.currentRoom.value = roomName;
  }

  public sendMessage(text: string) {
    if (this.socket?.connected) {
      this.socket.emit('send_to_room', {
        room: this.currentRoom.value,
        text,
        user: 'Me',
        timestamp: Date.now()
      });
    }
  }

  public sendTestMessage(text: string) {
    if (this.socket?.connected) {
      this.socket.emit(
        'from-client:mx:experimental-metrix:ping',
        {
          metrixEventType: 'from-client:mx:experimental-metrix:ping',
          reportType: 'default',
          stateValue: 'local-reactive-engine-exp',
          room: this.currentRoom.value,
          text,
          user: 'Me',
          ts: Date.now(),
          app: {
            name: 'reactive-engine-exp',
            version: '0.0.1'
          },
        },
        (arg: unknown) => console.log(arg)
      );
    }
  }

  // Метод для вызова из React при вводе текста
  public sendTypingNotification() {
    const now = Date.now();
    // Отправляем уведомление не чаще чем раз в 2 секунды (Throttling)
    if (now - this.lastTypingSent > 2000) {
      this.socket?.emit('typing', 'MyUserName'); // В реальности берем имя из AuthStore
      this.lastTypingSent = now;
    }
  }
}

/* NOTE: Основные отличия от чистого WebSocket:
1. Нет ручного JSON.parse: Socket.io автоматически превращает объекты в JSON и обратно.
2. Типизированные события: Вместо одного onmessage, ты можешь сделать `socket.on('chatMessage', ...)` и `socket.on('adminAction', ...)`.
3. Встроенный Reconnect: Тебе больше не нужен reconnectTrigger и setTimeout. Ты просто настраиваешь reconnectionAttempts в конфиге io().
4. Статус connected: Вместо проверки readyState === 1, используется свойство socket.connected.

Как это влияет на архитектуру:
Твой ReactiveEngine всё так же отлично работает в связке с Socket.io.
Сигналы (messages, status) обновляются внутри коллбэков сокета,
и React-компоненты мгновенно получают новые данные через engine.use().

NOTE: Про комнаты.
1. Для работы с комнатами (Rooms) или пространствами имен (Namespaces) в Socket.io мы будем использовать сигнал currentRoom. Как только его значение меняется, наш effect автоматически переподключит сокет к новой комнате.
В Socket.io есть два пути: Namespaces (разные URL) и Rooms (логическое разделение внутри одного соединения).
Рассмотрим наиболее гибкий вариант с Rooms через emit('join').

2. Как это работает в React
Благодаря тому, что currentRoom — это сигнал,
переключение комнат превращается в одну строку кода,
а всё «тяжелое» переподключение сокета происходит под капотом в движке.
*/
```

`~/services/SimpleChat/index.ts`
```ts
export * from './Logic.socket.io.ts';
```

`~/services/index.ts`
```ts
export * from './SimpleChat';
```

`~/components/SimpleChat.tsx`
```tsx
import { engine } from '~/utils/engine'
import { Logic as SimpleChatService } from '~/services'

export const SimpleChat = () => {
  const chat = engine.inject(SimpleChatService)
  const room = engine.use(chat.currentRoom)
  const messages = engine.use(chat.messages)

  return (
    <div>
      <h2>Room: {room}</h2>

      <div className="tabs">
        <button onClick={() => chat.switchRoom('general')}>General</button>
        <button onClick={() => chat.switchRoom('crypto')}>Crypto</button>
        <button onClick={() => chat.switchRoom('dev')}>Dev</button>
      </div>

      <div className="messages">
        {messages.map(m => (
          <p key={m.timestamp}><b>{m.user}:</b> {m.text}</p>
        ))}
      </div>

      <input onKeyDown={(e) => e.key === 'Enter' && chat.sendMessage(e.currentTarget.value)} />
    </div>
  );
}
```

*Преимущества такой реализации:*
1. Изоляция данных: При смене комнаты messages.value = [] гарантирует, что пользователь не увидит сообщения из предыдущего канала.
2. Автоматизация: Тебе не нужно вручную вызывать socket.off() или socket.leave(). Функция return внутри effect делает это автоматически при каждом переключении.
3. Единый источник истины: currentRoom можно менять из любой части приложения (например, из бокового меню или через URL параметры), и чат сам подстроится.

На этом наша архитектура полностью покрывает работу с реальным временем.

### NOTE: Для реализации индикатора печати (Typing Indicator) нам нужно решить две задачи:
1. Отправлять событие typing на сервер, когда пользователь вводит текст (с защитой от слишком частых вызовов — Throttling).
2. Получать события от других пользователей и отображать их список, автоматически скрывая имя пользователя, если он перестал печатать (через Timeout).

### NOTE: Апгрейд до использования комнат и печатающих людей
1. Добавим сигнал typingUsers и методы для обработки этого состояния.
Добавим сигнал typingUsers и методы для обработки этого состояния.
2. Использование в React компоненте
Теперь мы просто подписываемся на сигнал typingUsers и вызываем уведомление в onChange инпута.
```tsx
export const ChatInput = () => {
  const chat = engine.inject(SimpleChatServiceLogic)
  const typingUsers = engine.use(chat.typingUsers)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Уведомляем сервер, что мы печатаем
    chat.sendTypingNotification()
  };

  return (
    <div>
      <div style={{ height: '20px', fontSize: '12px', color: 'gray' }}>
        {typingUsers.length > 0 && (
          `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'печатают...' : 'печатает...'}`
        )}
      </div>

      <input
        type="text"
        onChange={handleChange}
        placeholder="Введите сообщение..."
      />
    </div>
  )
}
```

Почему это решение надежное:
1. Реактивность: Как только массив typingUsers меняется (добавилось имя или сработал таймер удаления), React-компонент мгновенно обновляет строку состояния.
2. Throttling: Мы не спамим сервер событием typing на каждое нажатие клавиши, а отправляем его раз в 2 секунды.
3. Авто-очистка: Если у пользователя пропал интернет или он просто закрыл вкладку, не допечатав, через 3 секунды его имя само исчезнет из списка у других участников благодаря setTimeout.

`~/services/SimpleChat/types.ts`
```ts
// Создаем константу типов
export const MessageType = {
  Chat: 'chat',
  Notification: 'notification',
  System: 'system'
} as const;

// Извлекаем типы из значений объекта
export type TMessageType = typeof MessageType[keyof typeof MessageType]

export interface ChatMessage {
  type: typeof MessageType.Chat;
  user: string;
  text: string;
  timestamp: number;
  message?: string;
  ok?: boolean;
}

export interface NotificationMessage {
  type: typeof MessageType.Notification;
  level: 'info' | 'warning';
  text: string;
}

export interface SystemMessage {
  type: typeof MessageType.System;
  event: 'user_joined' | 'user_left';
  userId: string;
}

export type AppMessage = ChatMessage | NotificationMessage | SystemMessage;
```

`~/components/SimpleChat.tsx`
```tsx
import { engine } from '~/utils/engine'
import { Button } from '~/components/Button';
import baseClasses from '~/baseClasses.module.scss'
import { Logic as SimpleChatServiceLogic } from '~/services/SimpleChat/Logic.socket.io'

const capitalize = (str: string): string =>
  !!str
  ? str.charAt(0).toUpperCase() + str.slice(1)
  : str;

export const SimpleChatService = () => {
  const chatStore = engine.inject(SimpleChatServiceLogic)
  const room = engine.use(chatStore.currentRoom)
  const messages = engine.use(chatStore.messages)
  const status = engine.use(chatStore.status)

  return (
    <div
      style={{
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <b>SimpleChatService | Room: {room} | Socket status: {status}</b>
      <div className={baseClasses.gridContainer3}>
        {
          ['general', 'crypto', 'dev'].map((roomName) => (
            <Button
              key={roomName}
              size="large"
              variant={room === roomName ? 'contained' : 'outlined'}
              color={room === roomName ? 'secondary-gray' : 'secondary'}
              onClick={() => chatStore.switchRoom(roomName)}
            >
              {capitalize(roomName)}
            </Button>
          ))
        }
      </div>
      <ul>
        {messages.map((m, i) => <li key={i}>{m.message}</li>)}
      </ul>
      <Button
        size="large"
        variant="outlined"
        color='primary'
        onClick={() => chatStore.sendTestMessage('Hello!')}
        disabled={status !== 'open'}
      >
        Send tst msg
      </Button>
    </div>
  )
}
```

*Пару комментариев:*
1. Метод `engine.inject()` работает как **Shared State**.
При первом вызове он создает экземпляр класса, а при всех последующих (включая ре-рендеры компонента) — просто возвращает ссылку на уже созданный объект из **Map**.
Результат: Переменная `chat` всегда ссылается на один и тот же объект в памяти.
Это не вызывает лишних аллокаций или тяжелых вычислений при обновлении компонента.

2. Когда это МОЖЕТ стать проблемой?
Есть два специфических сценария:
- А. Слишком частые вызовы inject в тяжелых циклах. Хотя поиск в Map работает быстро **O(1)**, если компонент рендерится очень часто (например, на каждое движение мыши), вызов `engine.inject` каждый раз — это микро-нагрузка.
Решение: Если компонент гипер-активный, можно обернуть вызов в **useMemo**, но обычно это лишнее усложнение.
- Б. Проблема "Чистоты" (Side Effects). Если конструктор класса SimpleChatServiceLogic делает что-то тяжелое или запускает сетевые запросы сразу при создании, то первый компонент, который его вызовет, инициирует этот процесс.
Важно: Убедись, что engine.inject не вызывается в теле функции, которая должна быть "чистой" (без побочных эффектов), если ты используешь React Strict Mode.
В Strict Mode компонент вызывается дважды, но так как у тебя синглтон, создастся он всё равно один раз.
Для React это безопасно, так как engine.inject возвращает стабильную ссылку.
Это гораздо эффективнее, чем создавать `new SimpleChatServiceLogic()` внутри **useState** или **useEffect**.
