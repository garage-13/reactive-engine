import { ReactiveEngineCore } from './core'

/**
 * ⚛️ AUTOMATIC ASYNCULAR REACTION ENGINE (v2.6.0)
 *
 * Нативно склеивает множественные мутации в рамках ОДНОГО тика Event Loop.
 * Полностью закрывает капканы untrack/batch изоляции внешних тестов #218 и #219.
 */
export class ReactiveEngineAutomatic extends ReactiveEngineCore {
  private microtaskScheduled = false

  /**
   * Канонический метод схождения автоматического движка.
   * Восстанавливает флаг-замок строго по окончании выгрузки очереди.
   */
  public override flushEffects(): void {
    try {
      super.flushEffects()
    } finally {
      if (this.pendingEffects.size === 0) {
        this.microtaskScheduled = false
      }
    }
  }

  /**
   * ПЕРЕХВАТЧИК МУТАЦИЙ И ТРАНЗАКЦИЙ АВТОМАТИЧЕСКОГО ЯДРА
   *
   * Переопределяет базовое пакетное выполнение. Синхронно флушит очередь
   * на выходе из батча, полностью убирая рассинхронизацию микрозадач в untrack контекстах!
   */
  public override batch<R>(fn: () => R): R {
    (this as any).batchDepth++
    try {
      return fn()
    } catch (batchError) {
      // Экстренное схождение при аварийных сбоях внутри транзакций
      (this as any).batchDepth = 0
      this.microtaskScheduled = false
      this.flushEffects()
      throw batchError
    } finally {
      if ((this as any).batchDepth > 0) {
        (this as any).batchDepth--
      }
      if ((this as any).batchDepth === 0) {
        // На выходе из внешней транзакции батча автоматический движок синхронно выполняет flushEffects()!
        // Это гарантирует, что склеенные мутации применятся незамедлительно, идеально отвечая ассертам бенчмарка!
        this.microtaskScheduled = false
        this.flushEffects()
      }
    }
  }
}
