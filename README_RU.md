# 🚀 ReactiveEngine (Инструкция на русском 🇷🇺)
Минималистичный реактивный движок на TypeScript с Dependency Injection и интеграцией для React.

https://t.me/bash_exp_ru/3393

# @pravosleva/reactive-engine 🚀

Легковесный, ультра-производительный и независимый реактивный движок на базе сигналов (Signals) и прозрачного отслеживания зависимостей для React и TypeScript приложений.

```bash
npm install @pravosleva/reactive-engine
# или
yarn add @pravosleva/reactive-engine
# или
pnpm add @pravosleva/reactive-engine
```

---

## 🧱 Встроенный Dependency Injection (DI-контейнер)

`ReactiveEngine` — это не просто хранилище сигналов, а полноценный DI-контейнер. Он позволяет связывать реактивные сервисы друг с другом, избегать антипаттерна «глобального синглтона» (что критично для **Next.js / SSR** и изолированного юнит-тестирования) и обеспечивает ленивую инициализацию модулей.

### Принцип работы

Вместо жесткого связывания через `import`, сервисы объявляют свои зависимости декларативно, запрашивая их у движка.

```ts
// 1. Объявляем сервис авторизации с реактивным сигналом
export class AuthService {
  public isAuthorized = this.engine.signal(false);
  constructor(private engine: ReactiveEngine) {}
}

// 2. Объявляем сервис корзины, который зависит от сервиса авторизации
export class CartService {
  private authService = this.engine.inject(AuthService); // Внедряем зависимость лениво!

  // Асинхронный ресурс автоматически подстраивается под состояние авторизации
  public cartResource = this.engine.resource(
    async (_, abortSignal) => {
      if (!this.authService.isAuthorized.value) return [];
      const res = await fetch('/api/cart', { signal: abortSignal });
      return res.json();
    },
    this.authService.isAuthorized // Зависимость ресурса от сигнала из другого сервиса
  );

  constructor(private engine: ReactiveEngine) {}
}
```

### Регистрация и использование в приложении

Вы можете регистрировать зависимости как готовые инстансы, классы или фабричные функции. Движок сам создаст их и закеширует при первом обращении.

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine';
import { AuthService, CartService } from './services';

const engine = new ReactiveEngine();

// Регистрируем сервисы (они будут созданы лениво только при первом вызове inject)
engine.provide(AuthService, (eng) => new AuthService(eng));
engine.provide(CartService, (eng) => new CartService(eng));

// Где-то в коде приложения или компоненте:
const cartService = engine.inject(CartService);
// Движок увидит, что CartService нужен AuthService,
// автоматически создаст AuthService, затем создаст CartService, свяжет их и вернет готовый результат.
```

---

## 🎯 Какие проблемы решает эта библиотека?

При разработке крупных React-приложений разработчики часто сталкиваются с архитектурными ограничениями стандартных инструментов. `@pravosleva/reactive-engine` создана для элегантного решения следующих проблем:

1. **Избыточные ререндеры (Over-rendering):**
  * *Проблема:* React Context API и классические иммутабельные сторы (Redux/Zustand) при изменении одного свойства в глубоком объекте заставляют перерисовываться все компоненты, подписанные на этот контекст или селектор.
  * *Решение:* Мелкогранулярная реактивность (Fine-grained reactivity). Компоненты точечно подписываются только на те примитивные сигналы, которые они выводят на экран. Смена стейта обновляет строго нужный DOM-узел.

2. **Проблема «разрыва разметки» (Tearing) и лаги в React 18+:**
  * *Проблема:* Внешние стейт-менеджеры при конкурентном рендеринге React (Concurrent Mode) могут приводить к багам, когда разные части экрана временно отображают разные данные.
  * *Решение:* Хук `useReactiveValue` построен на базе нативного механизма `useSyncExternalStore`. Это гарантирует абсолютную синхронность данных во всех компонентах и защищает интерфейс от мерцаний и разрывов.

3. **Лишние вычисления и нагрузка на процессор (Heavy Re-calculations):**
  * *Проблема:* Фильтрация, сортировка или тяжелая аналитика массивов данных запускаются заново на каждый рендер родительского компонента или изменение не связанных со стейтом пропсов.
  * *Решение:* Ленивые `Computed`-свойства с кэшированием вычислений (O(1)). Формула выполнится повторно только тогда, когда изменится исходный зависимый сигнал.

4. **Спам сетевыми запросами (Race Conditions & Fetch Flooding):**
  * *Проблема:* Быстрый клик пользователя по фильтрам каталога или пагинации порождает каскад параллельных сетевых запросов. Старый медленный запрос может прилететь позже нового и перезаписать актуальные данные (Race Condition).
  * *Решение:* Инструмент `Resource` автоматически оркеструет `AbortController`. При изменении сигналов-зависимостей предыдущий зависший fetch-запрос мгновенно отменяется на системном уровне браузера.

5. **Каскадные обновления интерфейса (Render Cascades):**
  * *Проблема:* Изменение 3–4 связанных параметров стейта в одном обработчике событий вызывает 3–4 последовательных цикла перерисовки интерфейса, перегружая Event Loop.
  * *Решение:* 100% автоматический батчинг (пакетирование). Движок упаковывает все синхронные и асинхронные изменения в одну микрозадачу, выполняя ровно 1 финальный ререндер.

6. **Утечки памяти при динамической логике (Memory Leaks):**
  * *Проблема:* Динамическое создание вычисляемых свойств (например, под фильтр конкретной вкладки) забивает память приложения брошенными эффектами, которые продолжают слушать стейт.
  * *Решение:* Встроенная автоочистка и кэширование вычислений в ядре. Хуки библиотеки сами вызывают метод `.destroy()` при размонтировании компонентов, бесследно удаляя технические эффекты из оперативной памяти.

## ⚡ Почему этот подход производительный?

В отличие от классического State Management в React (через Context API или глобальные сторы на иммутабельности), `@pravosleva/reactive-engine` работает по принципу **мелкогранулярных обновлений (Fine-grained reactivity)**:

* **Минимум ререндеров:** Компоненты подписываются не на «весь объект состояния», а строго на конкретные примитивные сигналы (`Signal`) или вычисляемые свойства (`Computed`), которые они выводят на экран. Изменение одного сигнала обновляет *только* тот компонент, который его читает.
* **O(1) вычисления:** `Computed` свойства ленивы. Они не пересчитываются, пока не изменятся исходные сигналы.
* **Автоматический Batching:** Движок умеет собирать множественные изменения сигналов в «пакеты» через микрозадачи. Сетевые ресурсы или тяжелые эффекты не будут перезапускаться 10 раз подряд при обновлении 10 сигналов в одном цикле.
* **Умная асинхронность:** Инструмент `resource` из коробки оркеструет `AbortController`, автоматически отменяя предыдущие зависшие сетевые запросы при изменении зависимостей.

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
import { counterSignal, doubleComputed } from '~/store';

export const Counter = () => {
  // Хук автоматически подпишется на изменения и вызовет ререндер
  const count = useReactiveValue(counterSignal);
  const doubleCount = useReactiveValue(doubleComputed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
import { engine } from '~/store';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button onClick={() => { tabSignal.value = 'posts'; }}>Вкладка Посты</button>
      <button onClick={() => { tabSignal.value = 'todos'; }}>Вкладка Задачи</button>
      <button onClick={() => { userIdSignal.value += 1; }}>Следующий пользователь</button>

      <h4>Текущая вкладка: {tab}</h4>

      {loading && <p>Загрузка данных по сети...</p>}
      {error && <p style={{ color: 'red' }}>Произошла ошибка: {error.message}</p>}
      {data && <pre>{JSON.stringify(data.slice(0, 3), null, 2)}</pre>}
    </div>
  );
};
```

### 2. Автоматическое пакетное обновление (100% Автобатчинг)
Вы можете создавать `computed`-свойства прямо внутри тела React-компонентов (например, когда формула зависит от динамических пропсов). **Вам не нужно использовать `useMemo` или вручную отписываться** — библиотека автоматически очистит память ядра при размонтировании компонента.

В `@pravosleva/reactive-engine` встроен **нативный автоматический батчинг обновлений** на базе микрозадач. Это означает, что если вы изменяете несколько сигналов подряд (синхронно или асинхронно), библиотека объединит их и вызовет **ровно один ререндер** React-компонента в конце текущего тика. Вам больше не нужно оборачивать вызовы в ручные функции `batch()`.

#### Простой кейс: Множественные синхронные обновления стейта
В примере ниже при клике на кнопку изменяются сразу три независимых сигнала. Благодаря автобатчингу компонент перерисуется всего один раз.

```tsx
import React, { useRef } from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { engine } from '~/store'

// Создаем три сигнала
const firstNameSignal = engine.signal('Иван')
const lastNameSignal = engine.signal('Иванов')
const ageSignal = engine.signal(25)

export const SimpleBatchDemo = () => {
  const firstName = useReactiveValue(firstNameSignal)
  const lastName = useReactiveValue(lastNameSignal)
  const age = useReactiveValue(ageSignal)

  const renderCountRef = useRef(0)
  renderCountRef.current++

  const handleUpdate = () => {
    // Три синхронных изменения подряд запустят ровно ОДИН ререндер компонента!
    firstNameSignal.value = 'Пётр'
    lastNameSignal.value = 'Петров'
    ageSignal.value = 30
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4>Простой батчинг (Профайлер)</h4>
      <p>Пользователь: {firstName} {lastName}, Возраст: {age}</p>
      <p style={{ color: 'blue' }}>Количество рендеров компонента: {renderCountRef.current}</p>
      <button onClick={handleUpdate}>Обновить профиль синхронно</button>
    </div>
  )
}
```

#### Продвинутый кейс: Батчинг в асинхронных потоках (Race Condition & API)
Автобатчинг работает «из коробки» даже внутри асинхронных функций, `setTimeout` или после `await fetch`. В этом примере после завершения сетевого запроса мы обновляем статус, данные и время, но React реагирует на это единым точечным обновлением интерфейса.

```tsx
// store.ts
export const isProcessingSignal = engine.signal(false, 'isProcessing')
export const apiDataSignal = engine.signal<string | null>(null, 'apiData')
export const lastUpdatedSignal = engine.signal<string>('', 'lastUpdated')
```

```tsx
// AdvancedBatchDemo.tsx
import React, { useRef } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { isProcessingSignal, apiDataSignal, lastUpdatedSignal } from '~/store'

export const AdvancedBatchDemo = () => {
  const isProcessing = useReactiveValue(isProcessingSignal)
  const apiData = useReactiveValue(apiDataSignal)
  const lastUpdated = useReactiveValue(lastUpdatedSignal)

  const renderCountRef = useRef(0)
  renderCountRef.current++

  const handleFetchData = async () => {
    isProcessingSignal.value = true // Сеттер 1 (Синхронный ререндер для индикатора загрузки)

    try {
      // Имитируем запрос к серверу
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const fakeResponse = "Успешный ответ от сервера #42"

      // АСИНХРОННЫЙ АВТОБАТЧИНГ:
      // Эти три обновления происходят внутри одной микрозадачи после await.
      // Движок соберет их в одну пачку, и React выполнит ровно 1 финальный ререндер!
      apiDataSignal.value = fakeResponse
      lastUpdatedSignal.value = new Date().toLocaleTimeString()
      isProcessingSignal.value = false
    } catch (error) {
      isProcessingSignal.value = false
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4>Продвинутый асинхронный батчинг</h4>
      <p>Статус: {isProcessing ? '⏳ Загрузка...' : '✅ Готов'}</p>
      <p>Данные: {apiData || 'Нет данных'}</p>
      <p>Последнее обновление: {lastUpdated || 'Никогда'}</p>
      <p style={{ color: 'purple' }}>Количество рендеров компонента: {renderCountRef.current}</p>
      <button onClick={handleFetchData} disabled={isProcessing}>
        Запросить данные по сети
      </button>
    </div>
  )
}
```

#### Продвинутый кейс: Сброс множественных фильтров (Heavy Computed Analytics)
В данном примере `Computed`-свойство выполняет тяжелую фильтрацию массива из 10 000 элементов. Когда пользователь нажимает кнопку «Сбросить всё», мы синхронно меняем сразу 4 сигнала (поиск, категорию, диапазон цен и сортировку). Автобатчинг гарантирует, что тяжелая функция фильтрации выполнится ровно **один раз** для финального состояния.

```ts
// store.ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'

export const engine = new ReactiveEngine()

export interface Product { id: number; title: string; category: string; price: number; }

export const searchSignal = engine.signal('', 'search')
export const categorySignal = engine.signal('all', 'category')
export const maxPriceSignal = engine.signal(10000, 'maxPrice')
export const sortBySignal = engine.signal<'price' | 'name'>('name', 'sortBy')
export const rawProductsSignal = engine.signal<Product[]>([], 'rawProducts')

// Тяжелое вычисление, зависящее от пяти сигналов сразу
export const filteredProductsComputed = engine.computed(
  () => {
    console.log('🔮 Выполняется тяжелая фильтрация 10,000 элементов...')
    let result = [...rawProductsSignal.value]

    if (searchSignal.value) {
      result = result.filter(p => p.title.toLowerCase().includes(searchSignal.value.toLowerCase()))
    }
    if (categorySignal.value !== 'all') {
      result = result.filter(p => p.category === categorySignal.value)
    }
    result = result.filter(p => p.price <= maxPriceSignal.value)

    return result.sort((a, b) => sortBySignal.value === 'price' ? a.price - b.price : a.title.localeCompare(b.title))
  },
  'filteredProducts'
);
```

```tsx
// CatalogDemo.tsx
import React, { useRef } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { searchSignal, categorySignal, maxPriceSignal, sortBySignal, filteredProductsComputed } from '~/store'

export const CatalogDemo = () => {
  const products = useReactiveValue(filteredProductsComputed)

  const renderCountRef = useRef(0)
  renderCountRef.current++

  const handleResetAllFilters = () => {
    // Изменяем 4 сигнала подряд.
    // Без автобатчинга тяжелая функция фильтрации запустилась бы 4 раза,
    // а компонент перерисовывался бы на каждом промежуточном шаге.
    // С автобатчингом: произойдет строго 1 вычисление и 1 ререндер React!
    searchSignal.value = ''
    categorySignal.value = 'all'
    maxPriceSignal.value = 10000
    sortBySignal.value = 'name'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h4>Фильтрация каталога (Heavy Analytics)</h4>
      <p>Найдено товаров: <b>{products.length}</b></p>
      <p style={{ color: 'green' }}>Рендеров компонента: {renderCountRef.current}</p>
      <button onClick={handleResetAllFilters}>Сбросить все фильтры</button>
    </div>
  )
}
```

### 3. Кэширование запросов с поддержкой времени жизни (TTL)

Вы можете использовать утилиты-декораторы для кэширования ответов сервера, чтобы при частом переключении вкладок не спамить сеть повторными запросами.

```ts
import { engine } from '~/store'
import { withCache } from './decorators/withCache' // Ваша утилита сache

const searchSignal = engine.signal('', 'search')

export const cachedSearchResource = engine.resource(
  withCache(
    async (query, abortSignal) => {
      const res = await fetch(`https://example.com{query}`, { signal: abortSignal })
      return res.json()
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

### Реакции и побочные эффекты через `useReactiveSubscription`

Иногда вам нужно просто **отреагировать** на изменение сигнала (например, запустить анимацию, вызвать уведомление или отправить метрику в аналитику), но при этом **не нужно перерисовывать сам компонент**. Для этого используется хук подписки.

#### Простой пример: Логирование изменений
Компонент ниже вообще не будет делать ререндер при кликах, но эффект внутри хука отработает на каждое изменение сигнала.

```tsx
import React from 'react'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'
import { counterSignal } from '~/store'

export const LoggerButton = () => {
  // Хук изолирован от рендеров. Он просто выполнит коллбек при изменении сигнала
  useReactiveSubscription(counterSignal, (newValue) => {
    console.log(`[Фидбек] Счетчик изменился на: ${newValue}`)
  })

  return (
    <button onClick={() => counterSignal.value++}>
      Кликни меня (Компонент не рендерится, но лог идет)
    </button>
  )
}
```

#### Продвинутый пример: Синхронизация с императивными API браузера
Хук идеально подходит для интеграции реактивного стейта со сторонними библиотеками, холстами (`<canvas>`), картами или нативными API браузера (например, тостами, медиа-плеерами или `localStorage`).

```tsx
// store.ts
export const isMutedSignal = engine.signal(false, 'isMuted')
```

```tsx
// AudioPlayer.tsx
import React, { useRef } from 'react'
import { useReactiveSubscription } from '@pravosleva/reactive-engine'
import { isMutedSignal } from '~/store'

export const AudioPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Синхронизируем реактивное состояние со свойством нативного DOM-узла
  useReactiveSubscription(isMutedSignal, (isMuted) => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  })

  return (
    <div>
      <video ref={videoRef} src="video.mp4" controls />
      <button onClick={() => { isMutedSignal.value = !isMutedSignal.value; }}>
        Переключить звук
      </button>
    </div>
  )
}
```

Таким образом, библиотека предоставляет полный цикл управления потоком данных: `State (Signal) -> Derivatives (Computed) -> UI (useReactiveValue) -> Reactions (useReactiveSubscription)`

### Умная автоочистка вычислений (Zero-Config Garbage Collection)

Вам больше не нужно вручную вызывать `.destroy()` или использовать `useEffect` для предотвращения утечек памяти при динамическом создании `computed`-свойств (например, внутри хука `useMemo` React).

Движок под капотом использует современное JavaScript API — `FinalizationRegistry`. Как только React удаляет компонент или меняет зависимости в `useMemo`, старая ссылка на вычисление уничтожается, а ядро автоматически удаляет брошенные реактивные эффекты и очищает внутренний кэш.

#### Пример: Безопасное инлайн-вычисление без утечек памяти
```tsx
import React, { useMemo } from 'react'
import { useReactiveValue } from '@pravosleva/reactive-engine'
import { engine, globalProductsSignal } from '~/store'

export const FilteredCatalog = ({ category }: { category: string }) => {
  // Вы можете безбоязненно использовать стандартный useMemo.
  // При смене категории старая ссылка сотрется, а движок сам зачистит allEffects ядра!
  const dynamicComputed = useMemo(() => {
    return engine.computed(() =>
      globalProductsSignal.value.filter(p => p.category === category)
    );
  }, [category]);

  const filteredList = useReactiveValue(dynamicComputed);

  return (
    <ul>
      {filteredList.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  )
}
```

### Прозрачная реактивность через `observer` (Аналог MobX)

Если ваш компонент отображает множество сигналов или вы хотите избавиться от вызовов хуков в теле функций, используйте функцию высшего порядка `observer`. Она автоматически отслеживает, какие сигналы или вычисляемые свойства считываются внутри JSX во время рендера, и точечно подписывает компонент на их изменения.

```tsx
import React from 'react'
import { createObserver } from '@pravosleva/reactive-engine'
import { counterSignal, userSignal, engine } from '~/store'

const observer = createObserver(engine)

// Оборачиваем компонент в observer.
// Теперь можно просто читать `.value` прямо в JSX — никаких хуков не требуется!
export const ProfileDashboard = observer(() => {
  return (
    <div style={{ padding: 20, border: '1px solid #aaa' }}>
      <h3>Пользователь: {userSignal.value.name}</h3>
      <p>Значение счетчика: {counterSignal.value}</p>

      <button onClick={() => counterSignal.value++}>Увеличить</button>
      <button onClick={() => { userSignal.value = { name: 'Пётр' }; }}>
        Сменить имя
      </button>
    </div>
  )
})
```

### Еще один продвинутый способ оптимизации рендеринга
```tsx
import React, { useRef } from 'react'
import { createObserverComponent } from '@pravosleva/reactive-engine'
import { engine } from '~/store'

// Инициализируем компонент-контейнер из нашей фабрики
const Observer = createObserverComponent(engine)

// Сигнал, который меняется очень часто (например, каждую секунду по веб-сокету)
const livePriceSignal = engine.signal(100)

export const MassiveDashboard = () => {
  // Счетчик рендеров всего ОГРОМНОГО компонента
  const totalDashboardRenders = useRef(0)
  totalDashboardRenders.current++

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h2>📊 Тяжелая панель аналитики</h2>
      <p>Рендеров всей страницы: {totalDashboardRenders.current}</p>

      {/*
        Тяжелый статический контент, который генерируется долго.
        Благодаря инлайн-контейнеру <Observer>, этот кусок НИКОГДА
        не будет перерисовываться при изменении цены!
      */}
      <div className="heavy-charts-and-tables">
        <p>...Тут рендерятся 10 тяжелых графиков и таблиц...</p>
      </div>

      {/*
        ТОЧЕЧНАЯ РЕАКТИВНОСТЬ:
        Оборачиваем в <Observer> только ту микро-зону, которая зависит от сигнала.
        При изменении livePriceSignal.value перерисовываться будет СТРОГО
        анонимная функция внутри <Observer>, экономя 99% ресурсов процессора!
      */}
      <Observer>
        {() => {
          const innerCounter = useRef(0);
          innerCounter.current++;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3>📈 Живой график цены (Текущая: ${livePriceSignal.value})</h3>
              <p style={{ color: 'green' }}>
                Рендеров этой микро-зоны: {innerCounter.current}
              </p>
            </div>
          );
        }}
      </Observer>

      <button onClick={() => { livePriceSignal.value += 5; }}>
        Симулировать изменение цены (+5$)
      </button>
    </div>
  )
}
```

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

### 2. Сложные объекты в зависимостях `withCache`
Декоратор `withCache` сериализует аргументы `source` через `JSON.stringify()` для создания ключа кэша.
* **Ограничение:** Не передавайте в качестве зависимостей ресурса объекты с циклическими ссылками, функции или сложные экземпляры классов (например, `Map`, `Set`, `Date`). Используйте только плоские объекты, массивы или примитивы.

### 3. Как сделать так, чтобы НЕЛЬЗЯ БЫЛО ЗАБЫТЬ вызвать `inject`? (Идеальный DX)
Чтобы избавить разработчиков от необходимости каждый раз вручную писать по две строчки (`inject` + `useReactiveValue`) в каждом компоненте, хорошей практикой является создание кастомных хуков над вашими сервисами.Вы можете упаковать эту рутину в один лаконичный хук прямо в файле сервиса или стора. Тогда забыть про `inject` будет физически невозможно:
```ts
// Внутри вашего файла фичи или стора (например, auth.store.ts):
export const useAuthUsername = () => {
  // Хук сам запрашивает инстанс у движка и сам разворачивает сигнал!
  const authService = engine.inject(AuthService);
  return useSyncExternalStore(
    (cb) => authService.username.subscribe(cb),
    () => authService.username.value
  );
};
```

Использование в компоненте сокращается до одной идеальной строчки:
```tsx
export const UserHeader = () => {
  const name = useAuthUsername(); // Чисто, декларативно, невозможно ошибиться!
  return <h1>Привет, {name}!</h1>;
};
```

### 💡 Важный нюанс!
В процессе улучшения библиотеки мы написали кастомные изолированные хуки `useReactiveValue` и `useReactiveValue0` (которые работают через `useSyncExternalStore`).
Метод `engine.use` — это более ранняя встроенная альтернатива этим хукам. Он делает абсолютно то же самое, но требует предварительного вызова `engine.setReactAdapters(useState, useEffect)`.
Мы оставили `engine.use` внутри ядра для тех разработчиков, которые любят вызывать методы прямо из инстанса движка, либо полностью заменить его в документации на созданный независимый хук `useReactiveValue`, так как он работает быстрее и нативнее для React 18+.

---

## 🗂️ Лицензия

MIT © Pravosleva

# OLD Doc (WIP)

## Общая логика
1. Метод `provide` — это «Регистрация рецепта»
Метод provide говорит движку: «Слушай, если кому-то в приложении понадобится деталь Х, вот тебе инструкция (фабрика), как её правильно собрать».
> Зачем он нужен:
> - Ленивая сборка: Когда вы вызываете provide, сам сервис не создается в эту же секунду. Движок просто записывает инструкцию в свою книгу рецептов (`this.factories`).
> - Гибкость (Подмена кода): Вы можете зарегистрировать под одним и тем же токеном реальный сервис для продакшена или фейковый (Mock) сервис для тестов. Код приложения этого даже не заметит.
```ts
// Мы просто дали движку рецепты сборки. Ни один сервис еще не создался в памяти!
engine.provide(AuthService, (eng) => new AuthService(eng));
engine.provide(CartService, (eng) => new CartService(eng));
```
2. Метод inject — это «Запрос и автоматическая сборка»
Метод inject говорит движку: «Мне на этом экране нужен готовый `CartService`. Выдай мне его».
> Зачем он нужен:
> - Автоматическое разпутывание зависимостей: Вам не нужно вручную смотреть, какие детали нужны для сборки `CartService`. Движок сам заглянет внутрь класса, увидит, что `CartService` требует внутри себя `AuthService`, пойдет, сначала соберет `AuthService`, вставит его в `CartService` и отдаст вам готовый, работающий монолит.
> - Кэширование (Синглтон): Движок собирает деталь по рецепту ровно один раз. Если на другом экране вы снова вызовете `engine.inject(CartService)`, движок не будет собирать его заново, а мгновенно отдаст уже готовый инстанс из своего кэша (`this.services`).
```ts
// Движок сам понял, как собрать CartService,
// сам создал AuthService и вернул готовый кэшированный синглтон
const cartService = engine.inject(CartService);
```
### 🔄 Пошаговая цепочка: как они работают в связке
Давайте посмотрим на полный жизненный цикл от старта приложения до вывода данных:
- Шаг 1 (Старт приложения): Вы вызываете engine.provide для всех сервисов в любом порядке. Приложение запускается мгновенно, память пуста, сервисы не созданы.
- Шаг 2 (Пользователь открыл вкладку «Корзина»): React-компонент корзины монтируется и просит: engine.inject(CartService).
- Шаг 3 (Работа движка под капотом):
- Движок проверяет кэш: «Есть готовый `CartService`? Нет».
- Движок берет рецепт `CartService` и начинает собирать.
- В процессе сборки он видит строчку `this.engine.inject(AuthService)`. Движок приостанавливает сборку корзины.
- Движок проверяет кэш: «Есть готовый `AuthService`? Нет».
- Движок берет рецепт `AuthService`, успешно создает его и кладет в кэш.
- Движок возвращается к корзине, отдает ей свежий `AuthService` из кэша, завершает сборку `CartService` и кладет его в кэш.
- Шаг 4 (Результат): Компонент получает идеально собранный сервис корзины, который реактивно связан с сервисом авторизации.

## 💡 Главный итог
Без `provide` и `inject` вам пришлось бы вручную импортировать файлы друг в друга, контролировать порядок создания (`const а = new A(); const b = new B(a);`) и вы не смогли бы изолировать тесты. С этими методами ваше ядро превращается в мощный архитектурный каркас, который делает всё сам.

## Про `provide`, `inject` и `use`
Метод `engine.use(item)` — это финальный мост (адаптер) между чистым реактивным миром вашей библиотеки и UI-компонентами React.
Если методы `provide` и `inject` нужны для того, чтобы красиво организовывать и связывать код вне компонентов React (в чистых TypeScript-классах и сервисах), то метод use нужен исключительно внутри React-компонентов, чтобы заставить их перерисовываться при изменении данных.

### 🔍 Про устаревший `use` (Объяснение разницы подходов)
> _Используйте более новый путь - `useReactiveValue`_

Ваши сигналы (Signal) и вычисления (Computed) — это объекты чистого JavaScript/TypeScript. Когда вы меняете значение `counterSignal.value = 5`, React об этом ничего не знает, потому что его встроенный движок рендеринга завязан только на свои локальные хуки (`useState` и `useReducer`).
Метод `engine.use` решает эту проблему под капотом. Посмотрим на его код из ядра:
```ts
public use<T>(item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn }): T {
  // 1. Создает локальный стейт React для компонента, который вызвал этот метод
  const [val, setVal] = this.reactAdapters.useState(item.value);
  // 2. Подписывается на изменения сигнала/вычисления
  this.reactAdapters.useEffect(
    () => {
      // Когда сигнал изменится, ядро вызовет setVal,
      // и React принудительно перерисует этот компонент!
      return item.subscribe(setVal);
    },
    [item]
  );
  // 3. Возвращает текущее значение для вывода в JSX
  return val;
}
```
### 🧱 Карта ролей: кто за что отвечает в библиотеке
Чтобы окончательно разложить архитектуру по полочкам, посмотрите на эту простую схему:
- `provide(Token, Factory)` — Регистрация. Используется при старте приложения. Говорит: «Как собирать сервисы».
- `inject(Token)` — Связывание. Используется внутри сервисов/классов. Говорит: «Дай мне другой сервис, от которого я завишу».
- `use(Signal / Computed)` — Отображение. Используется внутри React-компонентов. Говорит: «Выведи значение на экран и перерисуй меня, если оно изменится».

### 🎨 Наглядный пример: всё в одной цепочке
Давайте объединим `provide`, `inject` и `use` в один жизненный цикл реального приложения:
```tsx
// 1. Инициализация (Связующий слой — provide)
const engine = new ReactiveEngine();
engine.provide(AuthService, (eng) => new AuthService(eng));

// 2. Логика данных (Внедрение — inject)
export class AuthService {
  public username = this.engine.signal('Ivan'); // Реактивный сигнал
  constructor(private engine: ReactiveEngine) {}
}

// 3. Интерфейс (Отображение и реактивность — use)
export const UserHeader = () => {
  // Вытаскиваем сервис из DI-контейнера
  const authService = engine.inject(AuthService);

  // Подключаем сигнал к React-компоненту.
  // Благодаря .use(), если имя изменится, шапка профиля мгновенно обновится на экране!
  const name = engine.use(authService.username);

  return <h1>Привет, {name}!</h1>;
};
```

### 💡 Этот же пример с `useReactiveValue`
Вот как будет выглядеть этот же сквозной архитектурный пример, связывающий регистрацию, внедрение зависимостей и отображение, но с использованием нашего нового, полностью автономного и типобезопасного хука `useReactiveValue`:
```tsx
// 1. Инициализация (Связующий слой — provide)
// Выполняется один раз при старте приложения
import { ReactiveEngine } from '@pravosleva/reactive-engine';
import { AuthService } from './services/AuthService';

export const engine = new ReactiveEngine();

// Регистрируем рецепт сборки сервиса в DI-контейнере ядра
engine.provide(AuthService, (eng) => new AuthService(eng));
```

```tsx
// 2. Логика данных (Внедрение — inject)
// Чистый TypeScript-класс, полностью изолированный от React
export class AuthService {
  // Создаем реактивный сигнал для хранения имени пользователя
  public username = this.engine.signal('Ivan');

  constructor(private engine: ReactiveEngine) {}

  public changeName(newName: string) {
    this.username.value = newName;
  }
}
```

```tsx
// 3. Интерфейс (Отображение и реактивность — useReactiveValue)
// React-компонент, который точечно подписывается на изменения
import React from 'react';
import { useReactiveValue } from '@pravosleva/reactive-engine';
import { engine } from './index'; // Импортируем наш созданный инстанс движка
import { AuthService } from './services/AuthService';

export const UserHeader = () => {
  // Вытаскиваем нужный сервис из DI-контейнера по его Токену (Классу)
  const authService = engine.inject(AuthService);

  // Подключаем конкретный сигнал к React-компоненту.
  // Хук useReactiveValue под капотом использует useSyncExternalStore.
  // Если имя изменится, перерисуется ТОЛЬКО этот заголовок!
  const name = useReactiveValue(authService.username);

  return (
    <header style={{ padding: '10px', background: '#f5f5f5' }}>
      <h1>Привет, {name}!</h1>
      <button onClick={() => authService.changeName('Пётр')}>
        Сменить имя на Пётр
      </button>
    </header>
  );
};
```

## PERF
Для сравнения ReactiveEngine с Redux нужно оценивать их в двух плоскостях: алгоритмическая сложность (как работает код) и производительность в браузере (как часто обновляется UI).
Движок ReactiveEngine по своей природе ближе к MobX или Vue, поэтому он архитектурно отличается от Redux.
Вот основные критерии и способы сравнения:

### 1. Механика обновлений (Push vs Pull)
- **Redux** (Глобальный вещатель): Когда происходит dispatch, Redux уведомляет все подключенные компоненты. Каждый компонент должен запустить selector, чтобы понять, изменились ли его данные. Если селекторов сотни, это может тормозить основной поток.
- **ReactiveEngine** (Точечные подписки): Благодаря `signal` и `Proxy`, движок **ReactiveEngine** знает точно, какой компонент зависит от какого поля. Обновляется только тот компонент, чьи данные реально изменились.
**Результат:** На огромных деревьях объектов движок **ReactiveEngine** будет быстрее "из коробки" без мемоизации (useMemo, reselect).

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
