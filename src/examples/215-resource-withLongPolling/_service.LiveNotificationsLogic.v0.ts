import { BaseREService } from '../../BaseREService'
import { withLongPolling } from '../../decorators/withLongPolling'
import { CountdownService } from './service.CountdownService'

export interface NotificationItem {
  id: string
  text: string
  timestamp: string
  type: 'like' | 'message'
}

interface ServerResponse {
  ok: boolean
  notifications: NotificationItem[]
}

type TPollingDeps = [isLoopActive: boolean, pollingTick: number, isServerOnline: boolean];

export class LiveNotificationsLogic extends BaseREService {
  public countdown = this.engine.inject(CountdownService)

  // Базовые реактивные сигналы (Источники правды)
  public userIdSignal = this.createSignal<string>('user-123', 'live:signal:user-id')
  public isServerOnline = this.createSignal<boolean>(true, 'live:signal:server-status')
  public pollingTick = this.createSignal<number>(0, 'live:signal:tick')
  public isLoopActive = this.createSignal<boolean>(false, 'live:signal:loop-active')

  // Реактивные массивы для колонок дашборда
  public receivedNotifications = this.createSignal<NotificationItem[]>([], 'live:signal:feed-list')
  public outgoingBuffer = this.createSignal<NotificationItem[]>([], 'live:signal:outgoing-buffer')

  private feedSessionId = this.createSignal<string>(Math.random().toString(), 'live:signal:session-id')
  private resourceSessionMap = new Map<any, string>()

  // Метрики и статусы для UI
  public requestCount = this.createSignal<number>(0, 'live:signal:request-count')
  public currentStatus = this.createSignal<string>('🛑 Поллинг остановлен. Нажмите Init для запуска.', 'live:signal:status')

  private apiDeps = this.engine.computed<TPollingDeps>(() => [
    this.isLoopActive.value,
    this.pollingTick.value,
    this.isServerOnline.value
  ], 'live:computed:apiDeps')

  public notificationsResource = this.engine.resource<ServerResponse | null, TPollingDeps>(
    withLongPolling(
      async (deps, abortSignal) => {
        if (!this.isLoopActive.value) {
          throw new DOMException('Aborted by user directive', 'AbortError')
        }

        // Если тумблер выключен — бросаем честный сетевой throw
        if (!this.isServerOnline.value) {
          this.currentStatus.value = `🚨 Ошибка 502: Нет связи. Буферизируем...`
          throw new Error('502 Bad Gateway')
        }

        this.requestCount.value += 1
        this.currentStatus.value = '📡 Открыто длинное соединение. Ожидание событий...'

        const notificationsPayload = [...this.outgoingBuffer.value]
        this.outgoingBuffer.value = []

        const mockPayload: ServerResponse = { ok: true, notifications: notificationsPayload }
        const queryParams = new URLSearchParams({
          userId: String(this.userIdSignal.value),
          tick: String(this.pollingTick.value),
          _addData: JSON.stringify(mockPayload)
        }).toString()

        const response = await fetch(`/fake-feed-vite-proxy/?${queryParams}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.userIdSignal.value, notifications: notificationsPayload }),
          signal: abortSignal
        })

        if (!response.ok) {
          this.outgoingBuffer.value = [...notificationsPayload, ...this.outgoingBuffer.value]
          throw new Error(`Ошибка HTTP: ${response.status}`)
        }

        const jsonResult = await response.json()
        this.resourceSessionMap.set(jsonResult, this.feedSessionId.value)
        return jsonResult
      },
      {
        onNextTick: () => this.nextTick(),
        /**
         * Обработчик сетевых сбоев лонг-поллинга.
         * Реализует мост между абстрактной ошибкой декоратора и инфраструктурным сервисом.
         *
         * @param {number} ms - Время ожидания в миллисекундах до следующей попытки (вычисляется декоратором по экспоненте Backoff).
         * @param {() => void} onComplete - Сигнальный триггер декоратора. Должен быть передан в `countdown.start`
         * в качестве финального коллбэка. Его вызов по окончании таймера сообщает декоратору, что шаг блокировки завершен,
         * задержка зафиксирована и можно безопасно переходить к следующему циклу увеличения времени.
         */
        onError: (ms: number, onComplete: () => void) => this.countdown.start(ms, onComplete),
        delay: 3000,
        errorInitialDelay: 2000,
        errorMaxDelay: 8000,
      }
    ),
    this.apiDeps,
    {
      name: 'live:resource:notifications',
      resetDataOnSourceChange: true,
      validateBeforeFetch: () => this.isLoopActive.value,
      responseValidate: (res: any) => {
        const payload = res as ServerResponse | null
        if (!payload || payload.ok !== true) {
          this.currentStatus.value = '🚨 Ошибка валидации структуры ответа'
          return 'Некорректная структура JSON ответа'
        }

        const activeSession = this.feedSessionId.value
        if (payload.notifications && payload.notifications.length > 0) {
          const cachedSession = this.resourceSessionMap.get(payload)
          if (cachedSession && cachedSession !== activeSession) return true

          const incomingItems = payload.notifications
          const currentList = this.receivedNotifications.value
          const filteredItems = incomingItems.filter(item => !currentList.some(exist => exist.id === item.id))

          if (filteredItems.length > 0) {
            this.receivedNotifications.value = [...filteredItems, ...currentList]
            this.currentStatus.value = `⚡ Доставлен пакет из ${filteredItems.length} событий!`
          }
        } else {
          this.currentStatus.value = '⏳ Канал чист. Новых событий на бэкенде нет.'
        }
        return true
      }
    }
  )

  public startLongPolling = () => {
    if (this.isLoopActive.value) return
    this.isLoopActive.value = true
    this.notificationsResource.refetch()
  }

  public nextTick() {
    if (this.isLoopActive.value) {
      this.pollingTick.value += 1
    }
  }

  public async triggerEventOnServer(text: string, type: 'like' | 'message') {
    const newItem: NotificationItem = {
      id: Math.random().toString(36).substring(2, 11),
      text,
      timestamp: new Date().toLocaleTimeString(),
      type
    }
    this.outgoingBuffer.value = [...this.outgoingBuffer.value, newItem]
    this.currentStatus.value = `⏳ Событие зафиксировано и ждет отправки.`

    if (this.isLoopActive.value && this.isServerOnline.value) {
      this.nextTick()
    }
  }

  /**
   * ТУМБЛЕРЫ: Переключение статуса сети Онлайн/Оффлайн
   */
  public toggleServerStatus() {
    this.isServerOnline.value = !this.isServerOnline.value

    if (this.isServerOnline.value) {
      // Гасим дочерний UI-таймер обратного отсчета
      this.countdown.stop()
      this.currentStatus.value = '🔄 Сеть восстановлена. Выполняем немедленный перезапуск...'

      // Пинаем такт. Сессия инкрементируется в декораторе, сжигая старые таймауты ошибок!
      this.nextTick()
    } else {
      this.currentStatus.value = '🚨 Связь потеряна. Накапливаем буфер.'
      // Если поллинг запущен — принудительно пинаем такт, провоцируя честный выброс 502
      if (this.isLoopActive.value) {
        this.nextTick()
      }
    }
  }

  public clearFeed() {
    this.feedSessionId.value = Math.random().toString()
    this.receivedNotifications.value = []
    this.currentStatus.value = '🗑️ Лента успешно очищена.'
  }

  public destroy() {
    this.countdown.stop()
    this.isLoopActive.value = false
    this.pollingTick.value = 0
    this.resourceSessionMap.clear()
    this.outgoingBuffer.value = []
    this.receivedNotifications.value = []
    this.requestCount.value = 0
    this.isServerOnline.value = true
    this.currentStatus.value = '🛑 Поллинг остановлен. Нажмите Init для запуска.'
  }
}
