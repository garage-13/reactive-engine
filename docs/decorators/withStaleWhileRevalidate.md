# withStaleWhileRevalidate

`withStaleWhileRevalidate` — это декоратор, который обеспечивает стратегию "stale-while-revalidate" для функций загрузки данных. Он кэширует результаты запросов и возвращает устаревшие данные из кэша при ошибке или отмене повторного вызова, если их TTL (время жизни) еще валиден. Это помогает обеспечить непрерывность работы приложения и улучшить производительность.

## Синтаксис / Syntax

```typescript
withStaleWhileRevalidate<T>(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options: StaleOptions<T> = {}): (source: S, signal: AbortSignal) => Promise<T>
```

## Параметры / Parameters

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): Функция загрузки данных, которая принимает источник и сигнал прерывания.
- **options** (`StaleOptions<T>`):
  - **ttl** (`number`): Время жизни кэша в миллисекундах. По умолчанию нет ограничения.
  - **isLogsEnabled** (`boolean`): Включает логирование операций. По умолчанию `false`.
  - **maxSize** (`number`): Максимальный размер кэша. По умолчанию нет ограничения.

## Возвращаемое значение / Return Value

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>`
- **Properties**:
  - `data`: Кэшированные данные.
  - `savedTime`: Время сохранения данных в кэше.

## Примеры / Examples

### Базовый сценарий использования / Basic Usage Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string, signal: AbortSignal) => {
  return `data_for_${source}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher('user_1', abortSignal);
  console.log(res1); // data_for_user_1

  const res2 = await cachedFetcher('user_1', abortSignal);
  console.log(res2); // data_for_user_1 (из кэша)
})();
```

### Сценарий с сетевым сбоем / Network Error Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string, signal: AbortSignal) => {
  if (Math.random() < 0.5) throw new Error('Network Error');
  return `data_for_${source}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher('user_1', abortSignal);
  console.log(res1); // data_for_user_1

  try {
    const res2 = await cachedFetcher('user_1', abortSignal);
    console.log(res2); // data_for_user_1 (из кэша)
  } catch (error) {
    console.error(error); // Network Error
  }
})();
```

### Сценарий с мутацией Proxy-массива / Proxy Array Mutation Scenario

```typescript
import { withStaleWhileRevalidate } from 'reactive-engine/decorators/withStaleWhileRevalidate';
import { ReactiveEngine } from 'reactive-engine/core';

const fetcher = async (source: string[], signal: AbortSignal) => {
  return `data_for_${JSON.stringify(source)}`;
};

const cachedFetcher = withStaleWhileRevalidate(fetcher, { ttl: 5000 });

const engine = new ReactiveEngine();
const state = engine.reactive({
  filters: ['active']
});

const abortSignal = new AbortController().signal;

(async () => {
  const res1 = await cachedFetcher(state.filters, abortSignal);
  console.log(res1); // data_for_["active"]

  state.filters.push('archived');

  try {
    const res2 = await cachedFetcher(state.filters, abortSignal);
    console.log(res2); // Ошибка (содержимое изменилось)
  } catch (error) {
    console.error(error); // Ошибка
  }
})();
```

## Дополнительная информация / Additional Information

`withStaleWhileRevalidate` интегрируется с ядром Reactive Engine для обеспечения реактивности и управления состоянием. Он особенно полезен в сценариях, где требуется устойчивость к сетевым проблемам и оптимизация производительности путем кэширования данных.
