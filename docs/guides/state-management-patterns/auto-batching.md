# Автобатчинг и высокочастотные обновления

В **`ReactiveEngine` v3.0.1** автоматическая группировка обновлений (auto-batching) работает из коробки на уровне микрозадач (`queueMicrotask`). Вам не нужно вручную оборачивать серию изменений в транзакции — движок сам склеит все синхронные записи текущего тика в один проход по графу.

## Как это работает под капотом

1. **Мгновенная консистентность `computed`:** При изменении сигнала зависимые вычисляемые свойства (`computed`) сразу помечаются как устаревшие (`DIRTY`). Если прочитать `computed.value` следующей строкой, он лениво пересчитается и вернёт актуальный результат.
2. **Отложенный запуск `effect`:** Конечные реакции (`effect`) и подписки UI не срабатывают на каждое промежуточное изменение. Они ставятся в очередь и выполняются **ровно один раз** на границе микрозадачи (`queueMicrotask`), видя только финальное состояние всех сигналов.
3. **O(1)-курсор при перерасчёте:** Благодаря курсору `depsCursor` и интрузивным связям `NodeLink`, даже если эффект или `computed` подписан на тысячи сигналов, повторная сверка зависимостей проходит за O(1) без аллокаций памяти.

## Практический пример: Массовое обновление таблицы или фильтров

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// Создаём набор сигналов (например, фильтры или ячейки таблицы)
const search = engine.signal('', 'filter:search')
const category = engine.signal('all', 'filter:category')
const page = engine.signal(1, 'filter:page')

const querySummary = engine.computed(
  () => `q="${search.value}" | cat=${category.value} | page=${page.value}`,
  'filter:summary'
)

let effectRuns = 0
engine.effect(() => {
  effectRuns++
  console.log(`[Render #${effectRuns}]`, querySummary.value)
})
// Стартовый запуск: [Render #1] q="" | cat=all | page=1

// Меняем сразу три сигнала в одном синхронном блоке без ручного batch()
function resetAndSearch(newQuery: string) {
  search.value = newQuery
  category.value = 'electronics'
  page.value = 1

  // Computed уже знает актуальное значение при синхронном чтении:
  console.log('Sync read:', querySummary.value)
}

resetAndSearch('laptop')
// На границе микрозадачи эффект сработает РОВНО ОДИН РАЗ:
// [Render #2] q="laptop" | cat=electronics | page=1
```

## Когда использовать явный `engine.batch()`

Ручной вызов `engine.batch(fn)` имеет смысл только в двух сценариях:

* **Синхронный сброс эффектов:** Когда вам нужно, чтобы эффекты отработали строго синхронно сразу после выхода из `batch()`, не дожидаясь завершения текущей микрозадачи.
* **Использование низкоуровневого `ReactiveEngineCore`:** Базовый класс ядра без надстройки автобатчинга выполняет эффекты синхронно на каждый сеттер, поэтому там для склейки мутаций применяется `core.batch()`.
