import { BaseREService } from '../../BaseREService'

export class CountdownService extends BaseREService {
  // Реактивный сигнал текущего остатка секунд для отображения в UI
  public secondsLeft = this.createSignal<number>(0, 'countdown:signal:seconds')

  private intervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Запускает секундный таймер обратного отсчета
   * @param msDuration Время работы таймера в миллисекундах
   * @param onComplete Коллбэк, вызываемый строго по окончании отсчета
   */
  public start(msDuration: number, onComplete: () => void) {
    this.stop() // Страховка: сбрасываем старый интервал, если он висел

    let msRemaining = msDuration
    this.secondsLeft.value = Math.ceil(msRemaining / 1000)

    this.intervalId = setInterval(() => {
      msRemaining -= 1000
      this.secondsLeft.value = Math.max(0, Math.ceil(msRemaining / 1000))

      if (msRemaining <= 0) {
        this.stop()
        onComplete() // Сигнализируем бизнес-сервису, что задержка Backoff истекла
      }
    }, 1000)
  }

  /**
   * Принудительная жесткая остановка и очистка таймера
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.secondsLeft.value = 0
  }

  public destroy() {
    this.stop()
  }
}
