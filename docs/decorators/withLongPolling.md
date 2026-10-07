# Декоратор `withLongPolling`

Метод `withLongPolling` позволяет создавать асинхронные ресурсы, которые автоматически обновляют подписанные на них зависимости при изменении данных с использованием паттерна Long Polling.

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

## Примеры

### Пример на чистом JavaScript с типизацией TypeScript

```typescript
import { ReactiveEngine, AbstractService } from '@pravosleva/reactive-engine';

const engine = new ReactiveEngine();

class NotificationService extends AbstractService {
  public counter = this.engine.signal<number>(0);

  public apiState = this.engine.resource<{ items: string[] }, number>(
    withLongPolling(
      async (counterValue, abortSignal) => {
        const res = await fetch(
          `https://api.example.com/notifications?counter=${counterValue}`,
          { signal: abortSignal }
        );
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      },
      {
        delay: 1000,
        errorInitialDelay: 2000,
        errorMaxDelay: 10000,
        onNextTick: () => {
          this.counter.value += 1;
        },
        onError: (delay, increaseDelay) => {
          console.warn(`Ошибка сети. Следующая попытка через ${delay}мс`);
          increaseDelay();
        }
      }
    ),
    this.counter,
    'notificationResource'
  );
}

const notificationService = new NotificationService(engine);

notificationService.apiState.subscribe((state) => {
  console.log('Notification state:', state);
});

// Запустит перезагрузку ресурса
notificationService.counter.value += 1;
```

## Дополнительная информация

Декоратор `withLongPolling` является важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении данных с использованием паттерна Long Polling.
