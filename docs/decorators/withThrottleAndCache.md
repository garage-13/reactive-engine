# `withThrottleAndCache`

Декоратор `withThrottleAndCache` применяет ограничение частоты вызовов (троттлинг) с сохранением последнего вызова и проверяет валидность кэша перед отправкой реального сетевого запроса. Этот декоратор также поддерживает отмену операций через стандартный `AbortSignal`.

## Синтаксис

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';

interface ThrottleAndCacheOptions {
  limit?: number; // Интервал троттлинга в миллисекундах. По умолчанию 300 мс.
  ttl?: number;   // Время жизни кэша в миллисекундах. По умолчанию 5 минут (300000 мс).
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function withThrottleAndCache<S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options?: ThrottleAndCacheOptions
): (source: S, signal: AbortSignal) => Promise<T>;
```

## Параметры

- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): Асинхронная функция-загрузчик, выполняющая реальный сетевой или дисковый запрос.
- **options** (`ThrottleAndCacheOptions`):
  - **limit** (`number`, опционально): Окно троттлинга в миллисекундах (минимальный интервал между прямыми вызовами). По умолчанию 300 мс.
  - **ttl** (`number`, опционально): Время жизни кэша (Time-To-Live) в миллисекундах. По умолчанию 5 минут (300000 мс).

## Возвращаемое значение

- **Type**: `(source: S, signal: AbortSignal) => Promise<T>`
- **Описание**: Возвращает обернутую функцию, которая возвращает `Promise<T>`.

## Примеры

### Базовый пример использования

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';

interface SearchQuery { query: string; page: number; }
interface SearchResult { items: string[]; total: number; }

const fetchApi = async (search: SearchQuery, signal: AbortSignal): Promise<SearchResult> => {
  const response = await fetch(`/api/search?q=${search.query}&p=${search.page}`, { signal });
  return response.json();
};

// Создаем оптимизированную функцию поиска
const optimizedSearch = withThrottleAndCache(fetchApi, { limit: 500, ttl: 60 * 1000 });

// Пример вызова внутри реактивного эффекта
const controller = new AbortController();

optimizedSearch({ query: 'react', page: 1 }, controller.signal)
  .then(data => console.log('Результат:', data))
  .catch(err => {
    if (err.name === 'AbortError') console.log('Запрос отменен троттлером или пользователем');
  });
```

### Продвинутый пример с обработкой ошибок и мутаций Proxy-массива

```typescript
import { withThrottleAndCache } from '@pravosleva/reactive-engine';
import { ReactiveEngine } from '@pravosleva/reactive-engine';

const engine = new ReactiveEngine();
let callCount = 0;

const mockFetcher = async (arr: string[]) => {
  callCount++;
  return `items_count_${arr.length}`;
};

const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 });

const state = engine.reactive({
  ids: ['id_1']
});

const c1 = new AbortController();
const res1 = await optimizedFetcher(state.ids, c1.signal);
console.log('Первый результат:', res1); // Вывод: items_count_1

state.ids.push('id_2');
state.ids.push('id_3');

const c2 = new AbortController();
const promise2 = optimizedFetcher(state.ids, c2.signal);

await promise2.then(res2 => console.log('Второй результат:', res2)); // Вывод: items_count_3
```

## Дополнительная информация

Декоратор `withThrottleAndCache` интегрируется с системой реактивности, обеспечивая эффективное управление частотой запросов и кэшированием данных. Он поддерживает отмену операций через `AbortSignal`, что позволяет предотвратить выполнение ненужных запросов при изменении условий или уходе пользователя со страницы.
