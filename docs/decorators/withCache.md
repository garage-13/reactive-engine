# `withCache`

Декоратор `withCache` позволяет создавать кэширующие загрузчики данных, которые автоматически обновляют подписанные зависимости при изменении данных.

## Синтаксис

```typescript
withCache(fetcher: (source: S, signal: AbortSignal) => Promise<T>, options?: CacheOptions): (source: S, signal: AbortSignal) => Promise<T>
```

**Определение типов для `CacheOptions`:**

```typescript
interface CacheOptions {
  ttl?: number; // Время жизни кэша в миллисекундах (по умолчанию 5 минут)
}
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **options** (`CacheOptions`): Опции кэширования.

## Возвращаемое значение

Метод возвращает обернутую асинхронную функцию, которая имеет следующие свойства и методы:

- **`data`**: Данные ресурса.
- **`loading`**: Состояние загрузки ресурса (true/false).
- **`error`**: Ошибка, если произошла ошибка при загрузке данных.
- **`isRetrying`**: Флаг, указывающий на то, происходит ли повторная попытка загрузки.
- **`value`**: Полный объект состояния ресурса (`ResourceState<T>`).
- **`refetch()`**: Метод для принудительной перезагрузки ресурса.
- **`subscribe(cb: (val: ResourceState<T>) => void)`**: Подписка на изменение состояния ресурса. Возвращает функцию для очистки подписки.

## Примеры

### Пример на чистом JavaScript

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Состояние ресурса:', state);
});

counter.value++; // Запустит перезагрузку ресурса
```

### Пример с валидацией ответа

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, {
  name: 'my-resource',
  responseValidate: (data) => !!data || 'Данные пусты'
});

dataResource.subscribe((state) => {
  console.log('Состояние ресурса:', state);
});

counter.value++; // Запустит перезагрузку ресурса
```

### Пример с обработкой ошибок сети

```javascript
const engine = new ReactiveEngine();

const fetchData = async (counterValue, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?counter=${counterValue}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const counter = engine.signal(0);
const cachedFetch = withCache(fetchData, { ttl: 60 * 1000 });
const dataResource = engine.resource(cachedFetch, counter, 'my-resource');

dataResource.subscribe((state) => {
  if (state.error) {
    console.error('Произошла ошибка при загрузке данных:', state.error);
  } else {
    console.log('Состояние ресурса:', state);
  }
});

counter.value++; // Запустит перезагрузку ресурса
```

### Пример с мутацией Proxy-массива

```javascript
const engine = new ReactiveEngine();

const fetchData = async (arr, abortSignal) => {
  return `Длина массива: ${arr.length}`;
};

const reactiveArray = engine.reactive(['milk']);
const cachedFetch = withCache(fetchData);
const dataResource = engine.resource(cachedFetch, reactiveArray, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Состояние ресурса:', state);
});

reactiveArray.push('eggs'); // Мутация Proxy-массива
```

## Дополнительная информация

Ресурсы являются важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении данных. Декоратор `withCache` обеспечивает эффективное кэширование запросов, предотвращая дублирование параллельных запросов и улучшая производительность приложения.

**Ключевые особенности:**

- **Кэш по времени жизни (TTL)**: Кэшированные данные автоматически инвалидируются через определенный интервал времени.
- **Обработка ошибок**: Декоратор корректно обрабатывает сетевые ошибки и позволяет настроить поведение при возникновении ошибок.
- **Поддержка Proxy-массивов**: При мутации массива через метод `.push()` кэш автоматически инвалидируется, обеспечивая актуальные данные.

**Краевые случаи:**

1. **Cache Warming (тепление кэша)**: Декоратор поддерживает механизм тепления кэша, который позволяет заранее загружать и кэшировать данные для последующего использования.
2. **Обработка ошибок 500**: При возникновении сетевой ошибки с кодом 500 декоратор корректно обрабатывает ошибку и предоставляет информацию о ней в состоянии ресурса.
3. **Мутации Proxy-массивов**: Декоратор автоматически инвалидирует кэш при мутациях массива через метод `.push()`, обеспечивая актуальные данные после изменений.

Эти особенности делают декоратор `withCache` мощным инструментом для управления кэшированием данных в реактивной системе.
