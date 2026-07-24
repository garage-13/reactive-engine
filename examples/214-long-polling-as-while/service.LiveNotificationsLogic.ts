import { AbstractService } from '@pravosleva/reactive-engine'

export interface NotificationItem {
  id: string
  text: string
  timestamp: string
  type: 'like' | 'message'
}

export class LiveNotificationsLogic extends AbstractService {
  // Базовые реактивные сигналы (Источники правды для UI)
  public userIdSignal = this.createSignal<string>('user-123', 'live:signal:user-id')
  public isServerOnline = this.createSignal<boolean>(true, 'live:signal:server-status')

  // Реактивные массивы для колонок
  public receivedNotifications = this.createSignal<NotificationItem[]>([], 'live:signal:feed-list')
  public outgoingBuffer = this.createSignal<NotificationItem[]>([], 'live:signal:outgoing-buffer')

  // Статистика и информирование в статус-баре
  public requestCount = this.createSignal<number>(0, 'live:signal:request-count')
  public secondsToRetry = this.createSignal<number>(0, 'live:signal:retry-countdown')
  public currentStatus = this.createSignal<string>('📡 Канал связи готов. Ожидание действий...', 'live:signal:status')

  private countdownIntervalId: ReturnType<typeof setTimeout> | null = null
  private currentErrorDelay = 2000
  private errorInitialDelay = 2000
  private errorMaxDelay = 8000

  // Контроллер для жесткой остановки ЕДИНСТВЕННОГО фонового цикла поллинга
  private pollingAbortController: AbortController | null = null
  private isLoopRunning = false

  /**
   * ИСПРАВЛЕНИЕ БАГА: Единый, изолированный и контролируемый цикл Long Polling.
   * Он гарантированно не раздваивается, так как защищен флагом isLoopRunning.
   */
  public startLongPolling = async () => {
    if (this.isLoopRunning) return
    this.isLoopRunning = true

    this.pollingAbortController = new AbortController()
    const signal = this.pollingAbortController.signal

    while (!signal.aborted) {
      // Если сервер выключен — не шлем запросы, а просто ждем его включения
      if (!this.isServerOnline.value) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }

      this.requestCount.value += 1
      this.currentStatus.value = '📡 Открыто длинное соединение. Ожидание событий...'

      try {
        const response = await fetch('/fake-feed-vite-proxy/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: this.userIdSignal.value }),
          signal
        })

        if (!response.ok) {
          throw new Error(`Ошибка HTTP: ${response.status}`)
        }

        const result = await response.json()

        // Переподключение сброшено в дефолт при успешном ответе сети
        this.currentErrorDelay = this.errorInitialDelay

        // Если бэкенд прислал валидные новые события из своей очереди
        if (result && result.ok && result.notifications && result.notifications.length > 0) {
          const incomingItems = result.notifications as NotificationItem[]
          const currentList = this.receivedNotifications.value

          const uniqueNewItems = incomingItems.filter(
            item => !currentList.some(exist => exist.id === item.id)
          )

          if (uniqueNewItems.length > 0) {
            this.receivedNotifications.value = [...uniqueNewItems, ...currentList]
          }
          this.currentStatus.value = `⚡ Получен пакет из ${uniqueNewItems.length} событий!`
        }

        // Пауза перед открытием следующего длинного HTTP-запроса (Защита от спама)
        await new Promise((resolve) => setTimeout(resolve, 1000))

      } catch (error) {
        if (signal.aborted) return

        // В случае падения сети (502) запускаем Exponential Backoff задержку
        this.currentStatus.value = `🚨 Ошибка сети. Запуск таймера переподключения...`
        await this.runBackoffDelay()
      }
    }
  }

  /**
   * Синхронный экшен генерации события из UI
   */
  public async triggerEventOnServer(text: string, type: 'like' | 'message') {
    const newItem: NotificationItem = {
      id: Math.random().toString(36).substring(2, 11),
      text,
      timestamp: new Date().toLocaleTimeString(),
      type
    }

    if (!this.isServerOnline.value) {
      this.outgoingBuffer.value = [...this.outgoingBuffer.value, newItem]
      this.currentStatus.value = `⏳ Сервер оффлайн. Событие сохранено в левый буфер.`
      return
    }

    // Если бэкенд в онлайне — отправляем триггер-уведомление на сервер
    try {
      this.receivedNotifications.value = [newItem, ...this.receivedNotifications.value]
      this.currentStatus.value = '⚡ Событие отправлено на сервер!'

      await fetch('/fake-feed-vite-proxy/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification: newItem })
      })
    } catch (e) {
      // Автономный режим
    }
  }

  public toggleServerStatus() {
    this.isServerOnline.value = !this.isServerOnline.value

    if (this.isServerOnline.value) {
      this.stopCountdown()
      this.currentErrorDelay = this.errorInitialDelay
      this.currentStatus.value = '🔄 Сеть найдена. Выгружаем буфер...'
      this.flushOutgoingBuffer()
    } else {
      this.currentStatus.value = '🚨 Связь потеряна. Накапливаем буфер.'
    }
  }

  private async flushOutgoingBuffer() {
    const payload = [...this.outgoingBuffer.value]
    if (payload.length === 0) return

    this.outgoingBuffer.value = []

    try {
      await fetch('/fake-feed-vite-proxy/trigger-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: payload })
      })
    } catch (e) {
      // Автономный режим
    }

    this.receivedNotifications.value = [...payload, ...this.receivedNotifications.value]
    this.currentStatus.value = `⚡ Буфер из ${payload.length} событий успешно доставлен!`
  }

  private runBackoffDelay(): Promise<void> {
    this.stopCountdown()
    let msRemaining = this.currentErrorDelay
    this.secondsToRetry.value = Math.ceil(msRemaining / 1000)

    return new Promise((resolve) => {
      this.countdownIntervalId = setInterval(() => {
        msRemaining -= 1000
        this.secondsToRetry.value = Math.max(0, Math.ceil(msRemaining / 1000))

        if (msRemaining <= 0) {
          this.stopCountdown()
          this.currentErrorDelay = Math.min(this.currentErrorDelay * 2, this.errorMaxDelay)
          resolve()
        }
      }, 1000)
    })
  }

  private stopCountdown() {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId)
      this.countdownIntervalId = null
    }
    this.secondsToRetry.value = 0
  }

  public clearFeed() {
    this.receivedNotifications.value = []
  }

  /**
   * Жесткий деструктор. Намертво гасит фоновый fetch-цикл через AbortSignal.
   */
  public destroy() {
    this.stopCountdown()
    if (this.pollingAbortController) {
      this.pollingAbortController.abort()
      this.pollingAbortController = null
    }
    this.isLoopRunning = false
    this.outgoingBuffer.value = []
    this.receivedNotifications.value = []
    this.requestCount.value = 0
    this.currentErrorDelay = this.errorInitialDelay
    this.isServerOnline.value = true
    this.currentStatus.value = '📡 Канал связи готов.'
  }
}
