# `withLongPolling`

Метод `withLongPolling` позволяет создавать асинхронные ресурсы, которые автоматически обновляют подписанные на них зависимости при изменении данных с использованием паттерна Long Polling. Этот декоратор особенно полезен для реализации непрерывного опроса сервера с поддержкой экспоненциального отката при ошибках и защитой от пересечения параллельных сессий.

## Синтаксис

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

const pollingFetch = withLongPolling(
  async (source: S, signal) => {
    const res = await fetch(`/api/notifications?uid=${source}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Инвалидируем или триггерим обновление ресурса в ядре
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Ошибка сети. Следующая попытка через ${delay}мс`);
      increaseDelay(); // Удваиваем интервал до следующего тика
    }
  }
);
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **options** (`LongPollingOptions`): Опции для настройки Long Polling.

## Тип `LongPollingOptions`

```typescript
interface LongPollingOptions {
  /** Коллбэк для инкремента реактивного тика (перехода на следующую итерацию поллинга) */
  onNextTick: () => void;

  /**
   * Коллбэк, вызываемый при возникновении сетевой ошибки.
   * Позволяет внешней системе узнать о сбое и текущем времени ожидания до следующей попытки.
   *
   * @param {number} delayMs - Текущая задержка Exponential Backoff в миллисекундах перед следующим запросом.
   * @param {() => void} onRetryScheduled - Коллбэк-триггер. Должен быть вызван один раз, чтобы
   * просигнализировать декоратору, что шаг зафиксирован и задержка для следующей ошибки может быть увеличена.
   */
  onError: (delayMs: number, onRetryScheduled: () => void) => void;

  /** Пауза перед открытием следующего соединения в миллисекундах. По умолчанию 500 мс */
  delay?: number;
  /** Стартовая задержка Exponential Backoff в миллисекундах. По умолчанию 2000 мс */
  errorInitialDelay?: number;
  /** Потолок задержки Exponential Backoff в миллисекундах. По умолчанию 8000 мс */
  errorMaxDelay?: number;
  /** Внешний сигнал для жесткой остановки рекурсивных таймаутов */
  externalSignal?: AbortSignal;
}
```

## Возвращаемое значение

- **Type**: Функция, которая принимает `source` и `signal` и возвращает `Promise<T>`.
- **Методы**:
  - `subscribe`: Подписывается на изменения ресурса.
  - `destroy`: Уничтожает ресурс.

## Примеры

### Базовый сценарий использования

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

// Настраиваем функцию опроса новостной ленты
const pollingFetch = withLongPolling(
  async (userId: string, signal) => {
    const res = await fetch(`/api/notifications?uid=${userId}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Инвалидируем или триггерим обновление ресурса в ядре
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Ошибка сети. Следующая попытка через ${delay}мс`);
      increaseDelay(); // Удваиваем интервал до следующего тика
    }
  }
);

// Передаем декоратор в подсистему ресурсов ядра
const notificationResource = engine.resource(
  fetcher: pollingFetch,
  source: () => currentUserId.value
);
```

### Сценарий с обработкой ошибок и экспоненциальным откатом

```typescript
import { withLongPolling } from '@pravosleva/reactive-engine';

const pollingFetch = withLongPolling(
  async (userId: string, signal) => {
    const res = await fetch(`/api/notifications?uid=${userId}`, { signal });
    return res.json();
  },
  {
    delay: 1000,
    errorInitialDelay: 2000,
    errorMaxDelay: 10000,
    onNextTick: () => {
      // Инвалидируем или триггерим обновление ресурса в ядре
      notificationResource.refresh();
    },
    onError: (delay, increaseDelay) => {
      console.warn(`Ошибка сети. Следующая попытка через ${delay}мс`);
      increaseDelay(); // Удваиваем интервал до следующего тика
    }
  }
);

const notificationResource = engine.resource(
  fetcher: pollingFetch,
  source: () => currentUserId.value
);
```

### Сценарий с мутацией Proxy-массива

```typescript
import { withLongPolling, ReactiveEngine } from '@pravosleva/reactive-engine';

const engine = new ReactiveEngine();
const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `fetched_${arr.join('_')}`);
const mockNextTick = vi.fn();
const mockOnError = vi.fn();
const controller = new AbortController();

const pollingFetcher = withLongPolling(mockFetcher, {
  onNextTick: mockNextTick,
  onError: mockOnError,
  delay: 1000
});

const state = engine.reactive({
  roomIds: ['room_101']
});

const promise1 = pollingFetcher(state.roomIds, controller.signal);
await vi.advanceTimersByTimeAsync(0);

const res1 = await promise1;
expect(res1).toBe('fetched_room_101');
expect(mockFetcher).toHaveBeenCalledWith(['room_101'], controller.signal);

// Императивно мутируем массив — синхронный Proxy мгновенно обновляет свое состояние
state.roomIds.push('room_102');

// Запускаем вторую сессию опроса. Больше никаких искусственных микрозадач!
const promise2 = pollingFetcher(state.roomIds, controller.signal);
await vi.advanceTimersByTimeAsync(0);

const res2 = await promise2;

// Декоратор нативно считывает изменившийся Proxy-массив и отправляет свежие данные по сети
expect(res2).toBe('fetched_room_101_room_102');
expect(mockFetcher).toHaveBeenCalledTimes(2);
expect(mockFetcher).toHaveBeenLastCalledWith(['room_101', 'room_102'], controller.signal);
```

## Дополнительная информация

Декоратор `withLongPolling` является важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении данных с использованием паттерна Long Polling. Он обеспечивает непрерывный опрос сервера с поддержкой экспоненциального отката при ошибках и защитой от пересечения параллельных сессий, что делает его идеальным для реализации реальных-time обновлений данных.
