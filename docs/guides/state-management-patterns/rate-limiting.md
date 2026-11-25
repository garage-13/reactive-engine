# Контроль частоты запросов и вычислений (`withDebounce`, `withThrottle`, `withThrottleComputed`)

При работе с быстрым пользовательским вводом, прокруткой страницы (scroll), перемещением курсора (drag-and-drop) или потоком телеметрии в реальном времени реактивный граф может получать десятки обновлений в секунду. Без ограничения частоты это приводит к лавинообразному запуску сетевых запросов или тяжёлых перерасчётов.

В **`@pravosleva/reactive-engine` v3.0.x** для защиты сетевого и вычислительного слоёв предусмотрены три специализированных декоратора:

* **`withDebounce`** — откладывает сетевой запрос внутри `engine.resource()` до тех пор, пока поток изменений не затихнет на заданный интервал `delay`. Предыдущие ожидающие промисы принудительно отклоняются с `AbortError`.
* **`withThrottle`** — пропускает первый запрос немедленно (**Leading edge**), а при серии последующих вызовов внутри окна `limit` отбрасывает промежуточные и гарантированно выполняет самый актуальный запрос на выходе из окна (**Trailing edge**).
* **`withThrottleComputed`** — синхронный декоратор для тяжёлых вычислений в памяти (фильтрация больших массивов, расчёт геометрии). Ограничивает частоту обновления производного сигнала с помощью внутреннего планировщика и требует вызова `.destroy()` при очистке.

## 1. Поисковая строка с Debounce (`withDebounce` + `resource`)

Декоратор `withDebounce` сбрасывает таймер при каждом новом нажатии клавиши и отклоняет предыдущий ожидающий промис через `DOMException('Aborted due to debounce', 'AbortError')` — благодаря чему `engine.resource()` не считает отменённые промежуточные вводы ошибкой.

### Описание сервиса (`AutocompleteService.ts`)

```typescript
import { AbstractService, withDebounce } from '@pravosleva/reactive-engine'

export interface SuggestionItem {
  id: string
  label: string
}

export class AutocompleteService extends AbstractService {
  public searchInput = this.engine.signal('', 'autocomplete:input')

  // Запрос уйдёт в сеть только через 350 мс после остановки ввода
  private debouncedFetcher = withDebounce<string, SuggestionItem[]>(
    async (query, abortSignal) => {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка подсказок: ${res.status}`)
      }

      return res.json()
    },
    { delay: 350 }
  )

  public suggestionsResource = this.engine.resource(
    this.debouncedFetcher,
    this.searchInput,
    {
      name: 'autocomplete:suggestions',
      validateBeforeFetch: (q) => q.trim().length >= 2 || 'Минимум 2 символа',
    }
  )
}
```

## 2. Троттлинг сетевых запросов (`withThrottle` + `resource`)

В отличие от `withDebounce`, который ждёт полной остановки событий, **`withThrottle`** отправляет первый запрос мгновенно (**Leading edge**), а затем гарантирует отправку самого свежего состояния не чаще одного раза в `limit` миллисекунд (**Trailing edge**), отклоняя промежуточные перезаписанные вызовы через `AbortError`.

### Описание сервиса (`ViewportSyncService.ts`)

```typescript
import { AbstractService, withThrottle } from '@pravosleva/reactive-engine'

interface Coordinates {
  x: number
  y: number
}

export class ViewportSyncService extends AbstractService {
  public position = this.engine.signal<Coordinates>(
    { x: 0, y: 0 },
    'viewport:position'
  )

  // Отправляем координаты сразу при старте движения,
  // а далее — не чаще 1 раза в 500 мс (с гарантией доставки финальной точки)
  private throttledSaveFetcher = withThrottle<Coordinates, { saved: boolean }>(
    async (coords, abortSignal) => {
      const res = await fetch('/api/viewport/position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка сохранения позиции: ${res.status}`)
      }

      return res.json()
    },
    { limit: 500 }
  )

  public syncResource = this.engine.resource(
    this.throttledSaveFetcher,
    this.position,
    'viewport:syncResource'
  )
}
```

## 3. Троттлинг тяжёлых синхронных вычислений (`withThrottleComputed`)

Когда сетевых запросов нет, но перерасчёт большого массива, графа или аналитических агрегатов занимает десятки миллисекунд CPU, используйте **`withThrottleComputed`**. Он оборачивает геттер во внутренний эффект и сигнал, ограничивая частоту перерасчёта интервалом `limit`.

### Описание сервиса (`AnalyticsFilterService.ts`)

```typescript
import { AbstractService, withThrottleComputed } from '@pravosleva/reactive-engine'

export interface LogRecord {
  id: number
  message: string
  level: 'info' | 'warn' | 'error'
}

export class AnalyticsFilterService extends AbstractService {
  public rawLogs = this.engine.signal<LogRecord[]>([], 'analytics:rawLogs')
  public filterText = this.engine.signal('', 'analytics:filterText')

  // Тяжёлая фильтрация будет срабатывать мгновенно при первом вводе,
  // а далее — не чаще 1 раза в 250 мс
  public filteredLogs = withThrottleComputed(
    this.engine,
    () => {
      const query = this.filterText.value.toLowerCase().trim()
      const logs = this.rawLogs.value

      if (!query) return logs
      return logs.filter((item) => item.message.toLowerCase().includes(query))
    },
    { limit: 250 },
    'analytics:filteredLogs'
  )

  // Обязательно очищаем внутренний таймер планировщика при уничтожении сервиса/модуля
  public dispose() {
    this.filteredLogs.destroy()
  }
}
```

## Какой декоратор выбрать?

| Критерий | `withDebounce` | `withThrottle` | `withThrottleComputed` |
| :--- | :--- | :--- | :--- |
| **Слой применения** | Асинхронный `fetcher` (сеть / I/O) | Асинхронный `fetcher` (сеть / I/O) | Синхронный геттер в памяти (CPU) |
| **Когда срабатывает** | Только после паузы длиной `delay` (Trailing) | Сразу при старте (Leading) + финальное значение (Trailing) | Сразу при первом изменении + не чаще 1 раза в `limit` |
| **Промежуточные вызовы** | Отменяются через `AbortError` | Перезаписываются; отменённые получают `AbortError` | Отбрасываются; в сигнал попадает последнее значение |
| **Очистка ресурсов** | Автоматическая по `AbortSignal` от `resource` | Автоматическая по `AbortSignal` от `resource` | Требует ручного вызова **`.destroy()`** |
| **Лучший сценарий** | Поисковая строка, автодополнение, проверка уникальности логина | Сохранение координат Drag-and-Drop, автосохранение черновиков | Фильтрация таблиц на 10 000+ строк, живые графики и агрегаты |

## Важные детали реализации

* **Обязательный `.destroy()` для `withThrottleComputed`:** В отличие от сетевых декораторов, которые привязаны к `AbortSignal` конкретного запроса, `withThrottleComputed` создаёт долгоживущий `engine.effect` и внутренний `setTimeout`. Если вы создаёте его внутри динамического компонента или временного сервиса, обязательно вызывайте `throttled.destroy()` при размонтировании, чтобы избежать утечек таймеров.
* **100% совместимость с Fake Timers в тестах:** Все три декоратора опираются на нативные `setTimeout` и `Date.now()`, поэтому при юнит-тестировании в Vitest или Jest вы можете детерминированно перематывать время через `vi.advanceTimersByTime(delay)` без реального ожидания.
