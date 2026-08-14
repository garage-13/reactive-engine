## (WIP)

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
