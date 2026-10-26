# `withThrottleComputed`

Обертка-декоратор для создания дросселируемых (throttled) вычисляемых значений. Позволяет сгруппировать и ограничить частоту обновления тяжелых вычислений, защищая граф зависимостей и UI от лавинообразных изменений ("дребезга" данных).

## Синтаксис

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

interface ThrottleComputedOptions {
  limit: number;
}

export const withThrottleComputed = <T>(
  engine: ReactiveEngine,
  getter: () => T,
  options: ThrottleComputedOptions,
  signalName?: string
) => {
  // Реализация декоратора
}
```

## Параметры

- **engine** (`ReactiveEngine`): Экземпляр реактивного ядра, в контексте которого создаются примитивы.
- **getter** (`() => T`): Функция-вычислитель, содержащая реактивные сигналы. Зависимости собираются автоматически.
- **options** (`ThrottleComputedOptions`):
  - **limit** (`number`): Временной интервал задержки в миллисекундах (минимальное время между обновлениями).
- **signalName** (`string`, опционально): Необязательное имя для отладки. Будет впечено в системные маркеры логгера.

## Возвращаемое значение

- **Type**: Объект интерфейса вычисляемого значения.
  - **value** (`T`): Геттер для чтения текущего задросселированного значения (вызывает Pull-обновление).
  - **subscribe** (`(cb: (val: T) => void) => () => void`): Метод подписки на изменения значения (для связи с UI слоем).
  - **destroy** (`() => void`): Функция принудительной очистки активных таймеров. Обязательна к вызову при уничтожении контекста.

## Примеры

### Базовый пример

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

const searchInput = engine.signal('reac', 'search');

// Создаем задросселированный компут: будет обновляться не чаще чем раз в 300мс
const throttledSearch = withThrottleComputed(
  engine,
  () => executeHeavySearchFilter(searchInput.value),
  { limit: 300 },
  'heavy-search'
);

// Подписываемся на финальный результат
throttledSearch.subscribe((finalResult) => {
  renderSearchResults(finalResult);
});

// Не забываем вызвать destroy при анмаунте компонента/сервиса
onUnmounted(() => throttledSearch.destroy());
```

### Продвинутый пример с обработкой ошибок и подписками

```typescript
import { withThrottleComputed } from '@pravosleva/reactive-engine';

const dataSignal = engine.signal('initialData');

// Создаем задросселированный компут: будет обновляться не чаще чем раз в 500мс
const throttledData = withThrottleComputed(
  engine,
  () => fetchDataFromAPI(dataSignal.value),
  { limit: 500 },
  'api-throttling'
);

// Подписываемся на финальный результат и обрабатываем ошибки
throttledData.subscribe((finalResult) => {
  if (finalResult.error) {
    console.error('Ошибка при загрузке данных:', finalResult.error);
  } else {
    renderData(finalResult.data);
  }
});

// Не забываем вызвать destroy при анмаунте компонента/сервиса
onUnmounted(() => throttledData.destroy());
```

## Дополнительная информация

Декоратор `withThrottleComputed` интегрируется с основной системой реактивности, автоматически собирая зависимости внутри переданного геттера и управляя обновлениями через таймеры. Это позволяет эффективно контролировать частоту выполнения вычислений, что особенно полезно для сложных или ресурсоемких операций.
