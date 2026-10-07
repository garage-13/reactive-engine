# Декоратор `withLongPolling`

Метод `withLongPolling` позволяет создавать асинхронные ресурсы, которые автоматически обновляют подписанные на них зависимости при изменении данных.

## Синтаксис

```javascript
withLongPolling(fetcher, options)
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **options** (`LongPollingOptions`): Опции для настройки поведения поллинга.

## Возвращаемое значение

Метод возвращает функцию, которая принимает два аргумента: `source` и `signal`, и возвращает промис с данными типа `T`.

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
const dataResource = engine.resource(fetchData, counter, 'my-resource');

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
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
const dataResource = engine.resource(fetchData, counter, {
  name: 'my-resource',
  responseValidate: (data) => !!data || 'Данные пусты'
});

dataResource.subscribe((state) => {
  console.log('Resource state:', state);
});

counter.value++; // Запустит перезагрузку ресурса
```

## Дополнительная информация

Ресурсы являются важной частью реактивной системы, позволяя автоматически обновлять UI и другие зависимости при изменении данных.
