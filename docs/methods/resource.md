# `resource`

Метод `resource` позволяет создавать асинхронные ресурсы, которые автоматически обновляют подписанные на них зависимости при изменении данных.

## Синтаксис

```javascript
engine.resource(fetcher, source, optionsOrName)
```

## Параметры

- **fetcher** (`Function`): Асинхронная функция для загрузки данных.
  - Принимает два аргумента: `source` и `signal`.
  - Возвращает промис с данными типа `T`.

- **source** (`{ value: S }`): Источник данных, который зависит от сигнала или computed.

- **optionsOrName** (`string | ResourceOptions<T, S>`): Имя или опции ресурса.

## Возвращаемое значение

Метод возвращает объект `Resource`, который имеет следующие свойства и методы:

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
