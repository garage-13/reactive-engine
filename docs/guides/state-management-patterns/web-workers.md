# Вынос тяжёлых вычислений в Web Workers

Когда приложению нужно распарсить многомегабайтный CSV/JSON-файл, выполнить сложную агрегацию по десяткам тысяч записей, сгенерировать отчёт или обработать изображение на клиенте, выполнение этой логики в основном потоке (Main Thread) блокирует UI и вызывает «подвисания» анимаций и ввода.

В **`@pravosleva/reactive-engine` v3.0.1** интеграция с **Web Workers** строится поверх **`engine.resource()`** и **`AbstractService`**:

1. **Промис-обёртка над `postMessage`:** Сервис инкапсулирует экземпляр `Worker` и сопоставляет каждому запросу уникальный `requestId`, превращая асинхронный обмен сообщениями в стандартный `Promise`, совместимый с `engine.resource()`.
2. **Автоматическая отмена устаревших расчётов (`AbortSignal`):** Если пользователь изменил параметры фильтрации до того, как воркер закончил предыдущий расчёт, `resource` автоматически вызывает `abort()`, отклоняя старый промис и игнорируя запоздалый ответ воркера.
3. **Zero-copy передача больших буферов (`Transferable`):** При необходимости сервис может передавать `ArrayBuffer` без копирования памяти.

## Практический пример: Фоновый парсинг и агрегация больших наборов данных

### 1. Код воркера (`analytics.worker.ts`)

```typescript
export interface WorkerRequest {
  requestId: number
  rows: number[]
  threshold: number
}

export interface WorkerSuccessResponse {
  requestId: number
  ok: true
  result: {
    matchedCount: number
    average: number
  }
}

export interface WorkerErrorResponse {
  requestId: number
  ok: false
  error: string
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, rows, threshold } = event.data

  try {
    // Имитация ресурсоёмкого прохода по большому массиву в отдельном потоке
    let sum = 0
    let matchedCount = 0

    for (let i = 0; i < rows.length; i += 1) {
      const val = rows[i]
      if (val >= threshold) {
        sum += val
        matchedCount += 1
      }
    }

    const average = matchedCount > 0 ? sum / matchedCount : 0

    const response: WorkerSuccessResponse = {
      requestId,
      ok: true,
      result: { matchedCount, average },
    }
    self.postMessage(response)
  } catch (err: unknown) {
    const response: WorkerErrorResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : 'Неизвестная ошибка воркера',
    }
    self.postMessage(response)
  }
}
```

### 2. Реактивный сервис-обёртка (`WorkerAnalyticsService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import type { WorkerRequest, WorkerResponse } from './analytics.worker.js'

interface PendingTask {
  resolve: (value: { matchedCount: number; average: number }) => void
  reject: (reason: unknown) => void
}

export class WorkerAnalyticsService extends AbstractService {
  // Входные реактивные параметры для вычислений
  public dataset = this.engine.signal<number[]>([], 'worker:dataset')
  public threshold = this.engine.signal<number>(50, 'worker:threshold')

  private worker: Worker | null = null
  private nextRequestId = 1
  private pendingTasks = new Map<number, PendingTask>()

  // Объединяем входные сигналы в единый источник для ресурса
  private computeInput = this.engine.computed(
    () => ({
      rows: this.dataset.value,
      threshold: this.threshold.value,
    }),
    'worker:computeInput'
  )

  private getOrCreateWorker(): Worker {
    if (this.worker) return this.worker

    // Стандартный синтаксис бандлеров (Vite / Webpack 5) для подключения Web Worker
    const worker = new Worker(new URL('./analytics.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const task = this.pendingTasks.get(msg.requestId)
      if (!task) return

      this.pendingTasks.delete(msg.requestId)

      if (msg.ok) {
        task.resolve(msg.result)
      } else {
        task.reject(new Error(msg.error))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      const err = new Error(event.message || 'Критическая ошибка потока Web Worker')
      for (const task of this.pendingTasks.values()) {
        task.reject(err)
      }
      this.pendingTasks.clear()
    }

    this.worker = worker
    return worker
  }

  /**
   * Отправляет задачу в Web Worker и связывает её жизненный цикл с AbortSignal.
   */
  private runInWorker(
    rows: number[],
    threshold: number,
    signal: AbortSignal
  ): Promise<{ matchedCount: number; average: number }> {
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted before worker postMessage', 'AbortError'))
    }

    const worker = this.getOrCreateWorker()
    const requestId = this.nextRequestId++

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pendingTasks.delete(requestId)
        reject(new DOMException('Worker calculation aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })

      this.pendingTasks.set(requestId, {
        resolve: (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        reject: (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        },
      })

      const payload: WorkerRequest = { requestId, rows, threshold }
      worker.postMessage(payload)
    })
  }

  // Ресурс автоматически перезапускает расчёт при смене dataset или threshold
  // и отменяет предыдущий расчёт при новых изменениях
  public summaryResource = this.engine.resource(
    async ({ rows, threshold }, abortSignal) => {
      if (rows.length === 0) {
        return { matchedCount: 0, average: 0 }
      }
      return this.runInWorker(rows, threshold, abortSignal)
    },
    this.computeInput,
    'worker:summaryResource'
  )

  // Полная остановка потока воркера при уничтожении модуля или движка
  public dispose() {
    this.summaryResource.abort()
    for (const task of this.pendingTasks.values()) {
      task.reject(new DOMException('Worker disposed', 'AbortError'))
    }
    this.pendingTasks.clear()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
```

### 2. Реактивный сервис-обёртка (`WorkerAnalyticsService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import type { WorkerRequest, WorkerResponse } from './analytics.worker.js'

interface PendingTask {
  resolve: (value: { matchedCount: number; average: number }) => void
  reject: (reason: unknown) => void
}

export class WorkerAnalyticsService extends AbstractService {
  // Входные реактивные параметры для вычислений
  public dataset = this.engine.signal<number[]>([], 'worker:dataset')
  public threshold = this.engine.signal<number>(50, 'worker:threshold')

  private worker: Worker | null = null
  private nextRequestId = 1
  private pendingTasks = new Map<number, PendingTask>()

  // Объединяем входные сигналы в единый источник для ресурса
  private computeInput = this.engine.computed(
    () => ({
      rows: this.dataset.value,
      threshold: this.threshold.value,
    }),
    'worker:computeInput'
  )

  private getOrCreateWorker(): Worker {
    if (this.worker) return this.worker

    // Стандартный синтаксис бандлеров (Vite / Webpack 5) для подключения Web Worker
    const worker = new Worker(new URL('./analytics.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const task = this.pendingTasks.get(msg.requestId)
      if (!task) return

      this.pendingTasks.delete(msg.requestId)

      if (msg.ok) {
        task.resolve(msg.result)
      } else {
        task.reject(new Error(msg.error))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      const err = new Error(event.message || 'Критическая ошибка потока Web Worker')
      for (const task of this.pendingTasks.values()) {
        task.reject(err)
      }
      this.pendingTasks.clear()
    }

    this.worker = worker
    return worker
  }

  /**
   * Отправляет задачу в Web Worker и связывает её жизненный цикл с AbortSignal.
   */
  private runInWorker(
    rows: number[],
    threshold: number,
    signal: AbortSignal
  ): Promise<{ matchedCount: number; average: number }> {
    if (signal.aborted) {
      return Promise.reject(new DOMException('Aborted before worker postMessage', 'AbortError'))
    }

    const worker = this.getOrCreateWorker()
    const requestId = this.nextRequestId++

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pendingTasks.delete(requestId)
        reject(new DOMException('Worker calculation aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })

      this.pendingTasks.set(requestId, {
        resolve: (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        reject: (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        },
      })

      const payload: WorkerRequest = { requestId, rows, threshold }
      worker.postMessage(payload)
    })
  }

  // Ресурс автоматически перезапускает расчёт при смене dataset или threshold
  // и отменяет предыдущий расчёт при новых изменениях
  public summaryResource = this.engine.resource(
    async ({ rows, threshold }, abortSignal) => {
      if (rows.length === 0) {
        return { matchedCount: 0, average: 0 }
      }
      return this.runInWorker(rows, threshold, abortSignal)
    },
    this.computeInput,
    'worker:summaryResource'
  )

  // Полная остановка потока воркера при уничтожении модуля или движка
  public dispose() {
    this.summaryResource.abort()
    for (const task of this.pendingTasks.values()) {
      task.reject(new DOMException('Worker disposed', 'AbortError'))
    }
    this.pendingTasks.clear()

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
```

### Как быстро собрать мини-проект (`index.html` и бандлы)

Самый простой инструмент для этого — **Vite**, потому что он нативно понимает конструкцию `new Worker(new URL('./analytics.worker.ts', import.meta.url), { type: 'module' })` без единой строчки конфигурации.

#### 1. Структура папки проекта (`worker-demo/`)

```
worker-demo/
├── index.html
├── package.json
└── src/
    ├── main.ts
    ├── WorkerAnalyticsService.ts
    └── analytics.worker.ts
```

#### 2. `package.json`

```json
{
  "name": "reactive-engine-worker-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pravosleva/reactive-engine": "^3.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

#### 3. `index.html`

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reactive Engine + Web Worker Demo</title>
  </head>
  <body>
    <h1>Аналитика 1 000 000 записей в Web Worker</h1>
    <label>
      Порог фильтрации: <strong id="threshold-val">50</strong>
      <input id="threshold-input" type="range" min="0" max="100" value="50" />
    </label>
    <p id="status">Инициализация...</p>

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

#### 4. `src/main.ts`

```ts
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { WorkerAnalyticsService } from './WorkerAnalyticsService.js'

const engine = new ReactiveEngine()
const analytics = engine.inject(WorkerAnalyticsService)

const inputEl = document.getElementById('threshold-input') as HTMLInputElement
const valEl = document.getElementById('threshold-val') as HTMLElement
const statusEl = document.getElementById('status') as HTMLElement

// Загружаем 1 000 000 случайных чисел
analytics.dataset.value = Array.from({ length: 1_000_000 }, () => Math.random() * 100)

// Реактивно обновляем DOM при изменении состояния ресурса
engine.effect(() => {
  const { loading, data, error } = analytics.summaryResource.value
  valEl.textContent = String(analytics.threshold.value)

  if (loading) {
    statusEl.textContent = 'Считаем в фоновом потоке...'
    return
  }
  if (error) {
    statusEl.textContent = `Ошибка: ${error.message}`
    return
  }
  if (data) {
    statusEl.textContent = `Найдено: ${data.matchedCount} | Среднее: ${data.average.toFixed(2)}`
  }
})

inputEl.addEventListener('input', () => {
  analytics.threshold.value = Number(inputEl.value)
})
```

#### 5. Команды запуска и сборки

```bash
npm install
npm run dev      # Запуск локального dev-сервера с HMR
npm run build    # Сборка готового index.html + JS-бандлов (основного и воркера) в папку dist/
```
