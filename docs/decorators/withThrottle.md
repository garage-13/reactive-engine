# withThrottle

Декоратор `withThrottle` предназначен для создания дросселирующего загрузчика данных, который ограничивает частоту вызовов асинхронной функции `fetcher`. Это полезно при интеграции с системой ресурсов вашего ядра, чтобы предотвратить излишние запросы к серверу.

## Синтаксис

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const throttledFetch = withThrottle(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options?: ThrottleOptions): (source: S, signal: AbortSignal) => Promise<T>;
```

**Типы опций (`ThrottleOptions`)**

```typescript
interface ThrottleOptions {
  limit?: number; // Интервал троттлинга в миллисекундах. По умолчанию 300 мс.
}
```

## Параметры

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): Оригинальная асинхронная функция запроса, принимающая параметры и сигнал отмены.
- **options** (`ThrottleOptions`): Параметры конфигурации троттлинга.

## Возвращаемое значение

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>` — возвращает обернутую функцию, сохраняющую исходную сигнатуру типов.

## Примеры

### Базовый пример

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const fetchUserData = async (userId: string, signal: AbortSignal) => {
  const res = await fetch(`/api/users/${userId}`, { signal });
  return res.json();
};

// Ограничиваем частоту запросов профиля до 1 раза в 400мс
const throttledFetch = withThrottle(fetchUserData, { limit: 400 });

// Интеграция с подсистемой ресурсов вашего ядра
const userResource = engine.resource({
  fetcher: throttledFetch,
  source: () => currentUserId.value
});
```

### Промежуточные вызовы

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';

const mockFetcher = async (value: string, signal: AbortSignal) => {
  console.log(`Fetching ${value}`);
  return value;
};

const throttledFetcher = withThrottle(mockFetcher, { limit: 300 });

(async () => {
  try {
    await throttledFetcher('call-1', new AbortController().signal); // Выполнится мгновенно
    await throttledFetcher('call-2', new AbortController().signal); // Отклоняется
    await throttledFetcher('call-3', new AbortController().signal); // Выполнится на хвосте

    console.log('Final fetch completed');
  } catch (error) {
    console.error(error.message);
  }
})();
```

### Работа с массивами и коллекциями

```typescript
import { withThrottle } from '@pravosleva/reactive-engine';
import { ReactiveEngine } from '../../core';

const engine = new ReactiveEngine();
const mockFetcher = async (arr: string[]) => {
  console.log(`Fetching array of length ${arr.length}`);
  return arr;
};

const throttledFetcher = withThrottle(mockFetcher, { limit: 300 });

(async () => {
  const state = engine.reactive({
    items: ['A']
  });

  await throttledFetcher(state.items, new AbortController().signal); // Выполнится мгновенно с ['A']

  setTimeout(() => {
    state.items.push('B');
    state.items.push('C');

    throttledFetcher(state.items, new AbortController().signal).then(result => {
      console.log(`Final fetch result: ${result}`);
    });
  }, 150);
})();
```

## Дополнительная информация

Декоратор `withThrottle` интегрируется с системой реактивности и обеспечивает корректную обработку сигналов отмены (`AbortSignal`). Это предотвращает утечки памяти и позволяет гибко управлять асинхронными операциями.