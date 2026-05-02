# 🚀 ReactiveEngine
Минималистичный реактивный движок на TypeScript с Dependency Injection и интеграцией для React.

```bash
yarn add @pravosleva/reactive-engine
```

## 📦 Основные компоненты

### 1. ReactiveEngine
Центральный узел системы. Управляет состоянием, эффектами, DI и связью с React.
- signal<T>(value, options) — создание атомарного состояния.
- computed<T>(fn) — производные данные с кэшированием.
- reactive<T>(obj) — глубокая реактивность через Proxy.
- resource<T>(fetcher, source?) — асинхронные запросы с авто-отменой.
- inject<T>(Class) — получение или создание синглтон-сервиса.
- use(signal) — React-хук для подписки на изменения.

### 2. BaseREService
Абстрактный класс для бизнес-логики.
- Правило: Всегда инициализируйте сигналы напрямую в полях класса для корректной работы типов и DI.

## 🛠 Руководство пользователя
### Шаг 1: Настройка (Entry Point)
Создайте и экспортируйте единственный инстанс движка в локальном проекте `~/utils/engine.ts`:
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

export const engine = new ReactiveEngine();
engine.setReactAdapters(useState, useEffect); // Связываем с React
```

### Шаг 2: Создание логики (Service)
Опишите данные и методы их изменения.
```ts
import { BaseREService } from '@pravosleva/reactive-engine';

export class CounterService extends BaseREService {
  // Сигналы с runtime-валидацией
  public count = this.engine.signal(0, {
    name: 'CounterService:count',
    validate: (v) => v >= 0 || "Значение не может быть отрицательным"
  });

  // Вычисляемое значение (авто-обновление)
  public double = this.engine.computed(() => this.count.value * 2);

  increment = () => this.count.value++;
}
```

### Шаг 3: Использование в React
Подключайте логику к компонентам без лишнего бойлерплейта.
```ts
import { engine } from '~/utils/engine';
import { CounterService } from './CounterService';

export const Counter = () => {
  const store = engine.inject(CounterService); // Получаем сервис (синглтон)
  const count = engine.use(store.count);       // Подписываемся на изменения

  return <button onClick={store.increment}>{count}</button>;
};
```

## ⚡️ Продвинутые возможности
### Асинхронные данные (Resource)
Автоматически перезагружает данные при изменении зависимости (source).
```ts
this.user = this.engine.resource(
  async (id, signal) => {
    const res = await fetch(`/api/user/${id}`, { signal });
    return res.json();
  },
  this.userId // Зависимость
);
```

### Отладка (Logger)
Включите логирование всех изменений в консоль:
```ts
engine.onSignalChange = (name, next, prev) => {
  console.log(`[${name}] changed from`, prev, 'to', next);
};
```

## ⚠️ Важные правила
- Никакого undefined: Всегда инициализируйте сигналы в полях класса сразу при объявлении.
- Имена сигналов: Всегда давайте имена сигналам (this.engine.signal(0, 'my_name')) для удобной отладки в логах.
- Untrack: Если нужно прочитать значение сигнала внутри эффекта, не создавая зависимости, используйте engine.untrack(() => signal.value).

## Вариант (один из примеров) стандарта структуры папок
```
src/
├── utils/
│   └── engine.ts                 # Экземпляр движка
│
├── services/                     # Бизнес-логика (Store)
│   ├── index.ts                  # Экспорт всех инъекций (?)
│   ├── User/
│   │   ├── UserService.ts        # Логика пользователя
│   │   └── types.ts              # DTO и интерфейсы данных
│   └── Counter/
│       └── CounterService.ts
│
├── components/                   # UI-слой (React)
│   ├── Shared/                   # Общие компоненты
│   └── Features/                 # Компоненты с логикой
│       └── UserProfile/
│           ├── UserProfile.tsx   # Использует engine.use(store.user)
│           └── styles.module.css
│
├── hooks/                        # Глобальные React-хуки
│   └── useStore.ts               # Хелперы типа useUserStore()
│
└── main.tsx                      # Точка входа (настройка engine.setReactAdapters)
```

### Ключевые файлы для организации:
1. src/services/index.ts (Конфигурация)
Здесь создается единственный экземпляр и происходит его настройка.
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

export const engine = new ReactiveEngine();
engine.setReactAdapters(useState, useEffect);

// Включаем логгер в dev-режиме
if (import.meta.env.DEV) {
  engine.onSignalChange = (name, next, prev) => console.log(`[${name}]`, { prev, next });
}
```

### 2. src/hooks/useStore.ts (Удобство)
Чтобы не импортировать engine и Class каждый раз:
```ts
import { engine } from '~/utils/engine';
import { UserService } from '~/services/User/UserService';

export const useUserStore = () => engine.inject(UserService);
```

#### Простейший пример
Этот файл становится единственной точкой инициализации.

`~/utils/engine.ts`
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

// 1. Инициализация экземпляра
const engine = new ReactiveEngine();
engine.setReactAdapters(useState, useEffect);

export { engine }
```

`~/services/Counter/CounterService.ts`
```ts
import { BaseREService } from '@pravosleva/reactive-engine'

// 2. Инициализация сервиса
export class Logic extends BaseREService {
  public counter = this.engine.signal(
    0,
    {
      name: 'CounterService:signal:counter', // NOTE: Это для отладки
      validate: (v) => typeof v === 'number' && v >= 0 || 'Должно быть положительным числом',
    }
  )

  public counterDoubled = this.engine.computed(
    () => this.counter.value * 2,
    'CounterService:computed:doubled',
  )

  increment = () => this.counter.value++;
}
```

`~/services/index.ts`
```ts
import { Logic as CounterService } from './Counter/CounterService';

export { CounterService }
```

`~/hooks/useCounterLogic.ts`
```ts
import { engine } from '~/utils/engine'
import { CounterService } from '~/services'

export const useCounterLogic = () => engine.inject(CounterService)
```

`~/components/Counter`
```tsx
import { engine } from '~/utils/engine'
import { useCounterLogic } from '~/hooks'
import { Button } from '~/components/Button'

export const Counter = () => {
  const counterStore = useCounterLogic()
  // -- NOTE: Кстати, engine.use возвращает стабильную ссылку
  const counterValue = engine.use(counterStore.counter)
  // --
  const counterDoubled = engine.use(counterStore.counterDoubled)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <b>Counter | value: {counterValue} | doubled: {counterDoubled}</b>
      <Button
        size='large'
        variant='outlined'
        color='default'
        onClick={counterStore.increment}
      >
        + INC
      </Button>
    </div>
  )
}
```

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
- В Redux: При изменении одного счетчика проверку пройдут все 1000 селекторов.
- В ReactiveEngine: Сработает только 1 подписка.
- Замерьте FPS (кадры в секунду) при частом нажатии на кнопку.

### 3. Сравнение "на бумаге"
Критерий          Redux	                               ReactiveEngine

Сложность         O(N), где N - кол-во подписчиков	   O(K), где K - кол-во реально изменившихся полей
обновления

Память	          Низкая (простые объекты)	           Чуть выше (из-за хранения объектов Proxy и Set подписчиков)

Масштабируемость  Требует ручной оптимизации	         Масштабируется автоматически

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
      const url = 'ws://pravosleva.pro';

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

const chat = engine.inject(SimpleChatServiceLogic);
const room = engine.use(chat.currentRoom);
const messages = engine.use(chat.messages);

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
  const chat = engine.inject(SimpleChatServiceLogic);
  const typingUsers = engine.use(chat.typingUsers);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Уведомляем сервер, что мы печатаем
    chat.sendTypingNotification();
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
  );
};
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
  const chatStore = engine.inject(SimpleChatServiceLogic);
  const room = engine.use(chatStore.currentRoom);
  const messages = engine.use(chatStore.messages);
  const status = engine.use(chatStore.status);

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
  );
};
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
