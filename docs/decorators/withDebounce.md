# `withDebounce`

Метод `withDebounce` позволяет создавать дебаунс-функции, которые откладывают выполнение асинхронных операций на заданное время. Это полезно для оптимизации производительности, например, при обработке событий ввода пользователя.

## Синтаксис

```javascript
withDebounce(fetcher, options)
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **options** (`DebounceOptions`): Опции дебаунса.

## Возвращаемое значение

Метод возвращает обернутую функцию, которая принимает `source` и `signal`, и возвращает промис с данными типа `T`.

## Примеры

### Пример на чистом JavaScript

```javascript
const engine = new ReactiveEngine();

const fetchData = async (query, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?query=${encodeURIComponent(query)}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const querySignal = engine.signal('', 'search:signal:query');

querySignal.subscribe((query) => {
  debouncedFetch(query, new AbortController().signal).then(data => {
    console.log('Fetched data:', data);
  }).catch(error => {
    console.error('Error fetching data:', error);
  });
});

// Обновляем querySignal при вводе пользователя
```

### Пример с интеграцией в `resource`

```javascript
const engine = new ReactiveEngine();

const fetchData = async (query, abortSignal) => {
  const res = await fetch(
    `https://api.example.com/data?query=${encodeURIComponent(query)}`,
    { signal: abortSignal }
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
};

const debouncedFetch = withDebounce(fetchData, { delay: 400 });

const querySignal = engine.signal('', 'search:signal:query');
const searchResource = engine.resource(debouncedFetch, querySignal, 'my-resource');

searchResource.subscribe((state) => {
  console.log('Resource state:', state);
});

// Обновляем querySignal при вводе пользователя
```

## Дополнительная информация

Декоратор `withDebounce` полезен для оптимизации запросов к серверу, особенно при обработке событий ввода пользователя. Он позволяет откладывать выполнение запросов до тех пор, пока пользователь не перестанет вводить текст, что уменьшает количество ненужных запросов и улучшает производительность.

## Пример использования

<<< ../../examples/211-resource-withDebounce/service.SearchLogic.ts{ts}

<<< ../../examples/211-resource-withDebounce/Example211.tsx{tsx}
