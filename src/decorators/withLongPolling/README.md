# Декоратор `withLongPolling`

Практические кейсы применения декоратора `withLongPolling` (Архитектура v2: Event-Driven)

Обновленный декоратор `withLongPolling` — это высокопроизводительный инструмент для создания **инфраструктуры обновлений в реальном времени (Real-Time Updates)** на базе стандартного HTTP-протокола. В архитектуре v2 декоратор полностью избавлен от скрытых фоновых циклов `while` и рекурсивных таймаутов, которые ломали планировщик стейт-менеджера.

Теперь он работает как **чистый командный тактер**: выполняет ровно одну «длинную» сетевую транзакцию, а затем декларативно просит бизнес-сервис сдвинуть реактивный сигнал `pollingTick` вперед. Изменение сигнала инвалидирует кэш ресурса `engine.resource`, заставляя ядро движка абсолютно легитимно и нативно открывать следующее HTTP-соединение.

## Архитектурные кейсы применения

### 1. Системы мгновенных push-нотификаций (Live Notifications / Toasts)
* **Проблема без декоратора**: Нам нужно выводить всплывающие уведомления прямо в процессе работы пользователя с системой. Короткий поллинг (Short Polling) раз в 2 секунды генерирует колоссальный холостой трафик и забивает логи веб-сервера. Развертывание WebSockets — избыточно и требует настройки проксирования и усложнения авторизации на бэкенде.
* **Решение с Long Polling v2**: Ресурс связывается с реактивным кортежем зависимостей `[isLoopActive, pollingTick]`. Клиент открывает одно HTTP-соединение. Сервер держит его и молчит. Как только в базе данных появляется системное событие, сервер мгновенно завершает запрос. Декоратор принимает пакет, а его встроенная микро-пауза (`delay: 500`) дает слою отображения React время на плавную анимацию отрисовки Toast-карточки, после чего легитимно продвигает `pollingTick` для открытия следующего чистого канала связи.

### 2. Офлайн-буферизация событий и Offline-First чаты (Мессенджеры / Чат-комнаты)
* **Проблема**: Внутренние CRM-системы или чаты поддержки требуют мгновенной синхронизации сообщений. При этом пользователь может зайти в лифт или цокольный этаж, где временно пропадет мобильный интернет. Если интерфейс в этот момент заблокирует кнопки отправки сообщений, это сломает UX.
* **Решение с Long Polling v2**: Кнопки генерации сообщений остаются активными всегда. В режиме оффлайна все клики пользователя беспрепятственно накапливаются в реактивном сигнале левой колонки (`outgoingBuffer`). Декоратор v2 содержит механизм **Токенизации сессий ошибок**. Когда сеть восстанавливается, алгоритм Exponential Backoff плавно выводит ресурс из оффлайна, декоратор сжигает все старые зависшие таймауты ошибок в фоне и **пакетно (одним махом)** выгружает весь накопившийся оранжевый буфер на сервер за одну транзакцию, мгновенно перенося элементы в правую зелёную колонку успешной истории.

### 3. Мониторинг статуса тяжелых фоновых задач (Background Jobs / Export)
* **Проблема**: Пользователь нажимает кнопку «Сгенерировать тяжелый Excel-отчет за 3 года». Сервер обрабатывает эту задачу в фоновой очереди (например, через Celery/BullMQ) в течение 10–40 секунд. Заставлять клиента ждать один бесконечный синхронный HTTP-запрос нельзя — соединение гарантированно отвалится по таймауту браузера или Cloudflare Gateway Timeout ($504$).
* **Решение с Long Polling v2**: При клике сервер мгновенно возвращает `jobId` задачи, который записывается в реактивный кортеж зависимостей ресурса. Ресурс, обернутый в обновленный `withLongPolling`, опрашивает статус этой конкретной задачи. Соединение висит на сервере и закрывается только тогда, когда статус в бэкенде сменился на `completed`. Применение декларативного поля `responseValidate` гарантирует, что структура ответа провалидируется на уровне ядра, а в UI отобразится живой прогресс-бар.

### 4. Фиды данных и живые котировки (Live Dashboards / Sports Tracker)
* **Проблема**: Отображение динамически меняющихся панелей (актуальный счет футбольного матча или котировки валют). Данные могут обновляться неравномерно: то 5 раз за секунду, то молчать 10 минут.
* **Решение с Long Polling v2**: Позволяет не гонять пустые такты часов. Если изменений нет, соединение удерживается. Новая архитектура декоратора v2, благодаря тесной интеграции с `CountdownService` через Dependency Injection, позволяет плавно раздвигать окна блокировок при микро-сбоях инфраструктуры, информируя пользователя в статус-баре о точной секунде следующей автоматической попытки опроса.

## Сводная шпаргалка по поведению в экосистеме графа сигналов:

* **Изоляция побочных эффектов**: Бизнес-валидация структуры ответа полностью инкапсулирована в предикат `responseValidate`. Сайд-эффект наполнения истории вынесен в чистый `engine.effect`. Это гарантирует стабильность баджей и числовых счетчиков колонок дашборда — они меняются атомарно и без Race Conditions.
* **Истинный ленивый сон и защита от дублирования**: Пока рубильник `isLoopActive` равен `false`, метод `validateBeforeFetch` закрывает заслонку. Ресурс выбрасывает контролируемую ошибку отмены и безопасно спит, полностью защищая приложение от паразитного мерцания сети (запросы больше не утраиваются при первом монтировании компонента).
* **Жесткий рубильник (Destroy)**: Нажатие кнопки **Destroy** переключает семафор `isLoopActive` в `false`. Вычисляемый кортеж мгновенно мутирует, ядро движка автоматически активирует нативный `abortSignal`, обрывая текущий висящий в сети `fetch()`, а токенизация сессий в `withLongPolling` намертво выжигает фоновые макрозадачи `setTimeout` из оперативной памяти за 0 миллисекунд.

## Практические примеры интеграции декоратора `withLongPolling` с `engine.resource`

Ниже представлены два канонических примера использования доработанного декоратора версии v2 в архитектуре `@pravosleva/reactive-engine`. Оба примера строго следуют философии движка: управление жизненным циклом потока осуществляется через **вычисляемые кортежи зависимостей (`computed`)**, бизнес-валидация структуры ответа инкапсулирована в `responseValidate`, а низкоуровневые сетевые ошибки выбрасываются через `throw` для корректного триггера Exponential Backoff.


### Пример 1: Панель мониторинга фоновых задач (Background Job Tracker Dashboard)

Кейс применяется для отслеживания тяжелых серверных процессов (генерация Excel-отчетов, импорт XML/CSV). Ресурс лениво опрашивает статус задачи. Если задача завершилась — цикл останавливается, если нет — удерживает канал. При сбое сети (например, 504 Gateway Timeout) декоратор плавно раздвигает окна опроса через Backoff.

```ts
import { BaseREService } from '../../BaseREService'
import { withLongPolling } from '../../decorators/withLongPolling'
import { CountdownService } from '../infrastructure/CountdownService'

interface JobStatusResponse {
  ok: boolean
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  downloadUrl?: string
}

// Кортеж зависимостей: [Id задачи, Шаг авто-такта поллинга, Сигнал принудительной остановки]
type TJobDeps = [string | null, number, boolean];

export class LiveNotificationsLogic extends BaseREService {
  public countdown = this.engine.inject(CountdownService)
  public userIdSignal = this.createSignal<string>('user-123')
  public pollingTick = this.createSignal<number>(0)

  private apiDeps = this.engine.computed(() => [
    this.userIdSignal.value,
    this.pollingTick.value
  ])

  public notificationsResource = this.engine.resource(
    withLongPolling(
      async (deps, abortSignal) => {
        const response = await fetch(`/api/notifications?userId=${deps}`, { signal: abortSignal })
        if (!response.ok) throw new Error('Fetch failed')
        return response.json()
      },
      {
        onNextTick: () => { this.pollingTick.value += 1 },
        onStartBackoff: (ms, onComplete) => this.countdown.start(ms, onComplete),
        delay: 500,
        errorInitialDelay: 2000,
        errorMaxDelay: 8000
      }
    ),
    this.apiDeps
  )
}
```

### Пример 2: Чат-лента поддержки в реальном времени (Support Live Chat Feed)

Кейс, где Long Polling удерживается сервером до 30 секунд. При получении новых сообщений они пакетно пушатся в начало истории, а `pollingTick` увеличивается для открытия следующего «длинного» соединения. Смена комнаты чата (`activeRoomId`) мгновенно обрывает старый fetch за счет нативного `abortSignal` движка, предотвращая утечки и перекрестное наложение ответов чатов.

```ts
import { BaseREService } from '../../BaseREService'
import { withLongPolling } from '../../decorators/withLongPolling'
import { CountdownService } from '../infrastructure/CountdownService'

export interface MessageItem {
  id: string
  text: string
  author: string
  timestamp: string
}

interface ChatResponse {
  ok: boolean
  roomId: string
  messages: MessageItem[]
}

// Кортеж зависимостей: [Id активной комнаты, Шаг авто-такта поллинга]
type TChatDeps = [string, number];

export class LiveChatService extends BaseREService {
  private countdown = this.engine.inject(CountdownService)
  public activeRoomId = this.createSignal<string>('room-general')
  public pollingTick = this.createSignal<number>(0)

  private chatDeps = this.engine.computed(() => [
    this.activeRoomId.value,
    this.pollingTick.value
  ])

  public chatResource = this.engine.resource(
    withLongPolling(
      async (deps, abortSignal) => {
        const response = await fetch(`/api/chat/stream?room=${deps}`, { method: 'POST', signal: abortSignal })
        if (!response.ok) throw new Error('Chat gateway error')
        return response.json()
      },
      {
        onNextTick: () => { this.pollingTick.value += 1 },
        onStartBackoff: (ms, onComplete) => this.countdown.start(ms, onComplete),
        delay: 300,
        errorInitialDelay: 3000,
        errorMaxDelay: 12000
      }
    ),
    this.chatDeps
  )
}
```
