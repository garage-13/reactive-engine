# 🚀 ReactiveEngine
Минималистичный реактивный движок на TypeScript с Dependency Injection и интеграцией для React.

## 📦 Основные компоненты

### 1. ReactiveEngine
Центральный узел системы. Управляет состоянием, эффектами, DI и связью с React.

- signal<T>(value, options) — создание атомарного состояния.
- computed<T>(fn) — производные данные с кэшированием.
- reactive<T>(obj) — глубокая реактивность через Proxy.
- resource<T>(fetcher, source?) — асинхронные запросы с авто-отменой.
- inject<T>(Class) — получение или создание синглтон-сервиса.
- use(signal) — React-хук для подписки на изменения.

### 2. BaseService
Абстрактный класс для бизнес-логики.
- Правило: Всегда инициализируйте сигналы напрямую в полях класса для корректной работы типов и DI.

## 🛠 Руководство пользователя
### Шаг 1: Настройка (Entry Point)
Создайте и экспортируйте единственный экземпляр движка.
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from './utils/ReactiveEngine';

export const engine = new ReactiveEngine();
engine.setReactAdapters(useState, useEffect); // Связываем с React
```

### Шаг 2: Создание логики (Service)
Опишите данные и методы их изменения.
```ts
import { BaseService } from './BaseService';

export class CounterService extends BaseService {
  // Сигналы с runtime-валидацией
  public count = this.engine.signal(0, {
    name: 'counter',
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
import { engine } from './reactive';
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

## Вариант стандарта структуры папок
```
src/
├── core/                         # Ядро фреймворка (не зависит от проекта)
│   ├── ReactiveEngine.ts         # Основной класс движка
│   ├── BaseService.ts            # Базовый класс для сервисов
│   ├── types.ts                  # Общие интерфейсы (Signal, Resource, etc.)
│   └── index.ts                  # Публичное API ядра
│
├── services/                     # Бизнес-логика (Store)
│   ├── index.ts                  # Экземпляр engine и экспорт всех инъекций
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
Здесь ты создаешь единственный экземпляр и настраиваешь его.
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '../core/ReactiveEngine';

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
import { engine } from '../services';
import { UserService } from '../services/User/UserService';

export const useUserStore = () => engine.inject(UserService);
```

### Почему такая структура?
- Core в изоляции: Ты можешь скопировать папку core в другой проект, и она будет работать.
- Масштабируемость: Каждый сервис (User, Counter, Auth) лежит в своей папке.
- Легкие тесты: Тесты для services/ лежат рядом с файлами .ts и не требуют запуска браузера.

### Еще о том, как это готовить
Для того чтобы структура была максимально чистой, мы используем паттерн "Barrel" (Бочка). Это позволяет импортировать всё необходимое из одной точки, избегая «леса» из импортов в компонентах.

Вот как настроить автоматические экспорты:
#### 1. src/core/index.ts (Публичное API ядра)
Здесь мы собираем все системные файлы.
```ts
export * from './ReactiveEngine';
export * from './BaseService';
export * from './types';
```

#### 2. src/services/index.ts (Главный конфигуратор)
Этот файл становится единственной точкой инициализации.
```ts
import { useState, useEffect } from 'react';
import { ReactiveEngine } from '../core';
import { CounterService } from './Counter/CounterService';
import { UserService } from './User/UserService';

// 1. Инициализация экземпляра
export const engine = new ReactiveEngine();
engine.setReactAdapters(useState, useEffect);

// 2. Регистрация глобальных сервисов (если нужно предоставить моки или фабрики)
// engine.provide(UserService, (eng) => new UserService(eng));

// 3. Удобный экспорт типизированных хуков для доступа к сторам
export const useCounterStore = () => engine.inject(CounterService);
export const useUserStore = () => engine.inject(UserService);

// Экспортируем сам движок для использования engine.use в компонентах
export { CounterService, UserService };
```

#### 3. Как теперь выглядят импорты в компоненте (UserProfile.tsx)
Вместо того чтобы искать файлы по всей папке utils или components, вы просто пишете:
```ts
import { engine, useUserStore } from '@/services';

export const UserProfile = () => {
  const userStore = useUserStore();
  const { data, loading } = engine.use(userStore.userProfile);

  return (
    <div>{loading ? '...' : data?.name}</div>
  );
};
```

#### 4. Настройка Alias в tsconfig.json (Бонус)
Чтобы не писать длинные пути типа ../../services, добавь алиасы. Это сделает код еще чище.
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/core/*": ["src/core/*"],
      "@/services": ["src/services/index"],
      "@/hooks/*": ["src/hooks/*"]
    }
  }
}
```
### Почему это эффективно:
- Инкапсуляция: Все настройки движка (логи, адаптеры) скрыты внутри services/index.ts.
- Одна точка входа: Если ты решишь сменить название сервиса или путь к нему, тебе нужно будет поправить это только в одном index.ts.
- Удобство для команды: Разработчик просто пишет use... и IDE сама предлагает импорт из @/services.

## PERF
Для сравнения твоего ReactiveEngine с Redux нужно оценивать их в двух плоскостях: алгоритмическая сложность (как работает код) и производительность в браузере (как часто обновляется UI).
Твой движок по своей природе ближе к MobX или Vue, поэтому он архитектурно отличается от Redux.
Вот основные критерии и способы сравнения:

### 1. Механика обновлений (Push vs Pull)
- Redux (Глобальный вещатель): Когда происходит dispatch, Redux уведомляет все подключенные компоненты. Каждый компонент должен запустить selector, чтобы понять, изменились ли его данные. Если селекторов сотни, это может тормозить основной поток.
- ReactiveEngine (Точечные подписки): Благодаря signal и Proxy, твой движок знает точно, какой компонент зависит от какого поля. Обновляется только тот компонент, чьи данные реально изменились.
Результат: На огромных деревьях объектов твой движок будет быстрее "из коробки" без мемоизации (useMemo, reselect).

### 2. Как замерить на практике?
А. Инструменты (Chrome DevTools)
1. Открой вкладку Performance в браузере.
2. Запусти запись.
3. Выполни массовое обновление (например, измени 1000 элементов списка).
4. Смотри на параметр Scripting (сколько времени JS считал изменения) и Rendering (сколько времени React перерисовывал их).

Б. Тест "1000 счетчиков"
Создай страницу с 1000 независимых компонентов-счетчиков.
- В Redux: При изменении одного счетчика проверку пройдут все 1000 селекторов.
- В ReactiveEngine: Сработает только 1 подписка.
- Замерь FPS (кадры в секунду) при частом нажатии на кнопку.

### 3. Сравнение "на бумаге"
Критерий         Redux	                               ReactiveEngine

Сложность        O(N), где N - кол-во подписчиков	     O(K), где K - кол-во реально изменившихся полей
обновления

Память	         Низкая (простые объекты)	             Чуть выше (из-за хранения объектов Proxy и Set подписчиков)

МасштабируемостьТребует ручной оптимизации	           Масштабируется автоматически

### 4. Где Redux может выиграть?
Redux использует обычные JS-объекты. Твой движок использует Proxy. Чтение данных через Proxy на доли наносекунд медленнее, чем чтение из обычного объекта. Если тебе нужно совершить 1 000 000 математических операций над данными в секунду, Redux (точнее, чистый JS) будет быстрее. Но в контексте UI-фреймворка эти задержки незаметны.
Итог
Твой движок будет эффективнее в приложениях с высокой частотой обновлений (чаты, трейдинговые графики, игры), так как он избавляет React от лишней работы по сравнению данных (diffing).
