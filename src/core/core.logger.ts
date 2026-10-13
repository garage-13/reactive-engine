import { LogEventType } from "./types"

interface LogDetails {
  from?: unknown;
  to?: unknown;
  payload?: unknown;
}

export class ReactiveDebounceLogger {
  private static churnTracker = new Map<string, number[]>()

  private static readonly TIME_WINDOW_MS = 1000
  private static readonly CHURN_WARNING_THRESHOLD = 3
  private static readonly CHURN_CRITICAL_THRESHOLD = 6

  private static isDeepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private static analyzeSignalChurn(label: string): { marker: string; info: string } {
    const now = Date.now()
    if (!this.churnTracker.has(label)) {
      this.churnTracker.set(label, [])
    }

    const history = this.churnTracker.get(label)!
    const cutoff = now - this.TIME_WINDOW_MS
    const activeHistory = history.filter(ts => ts > cutoff)
    activeHistory.push(now)
    this.churnTracker.set(label, activeHistory)

    const updateCount = activeHistory.length
    const intervalSec = (this.TIME_WINDOW_MS / 1000).toFixed(1)

    if (updateCount >= this.CHURN_CRITICAL_THRESHOLD) {
      return {
        marker: '🔴',
        info: `[CRITICAL CHURN] (${updateCount} изм./${intervalSec}s) — Нужен debounce!`
      }
    }

    if (updateCount >= this.CHURN_WARNING_THRESHOLD) {
      return {
        marker: '🟡',
        info: `[WARNING CHURN] (${updateCount} изм./${intervalSec}s)`
      }
    }

    return {
      marker: '🟢',
      info: `[STABLE] (${updateCount} изм./${intervalSec}s)`
    }
  }

  public static processLog(
    engineLogger: any,
    queueLogFn: Function,
    params: { type: LogEventType; label: string; details?: LogDetails; isInternalCoreSignal?: boolean }
  ) {
    const { type, label, details, isInternalCoreSignal = false } = params

    if (!engineLogger.isEnabled) return
    if (isInternalCoreSignal && !engineLogger.isCoreOptimizationDebugEnabled) return

    // 1. ОБРАБОТКА ХОЛОСТЫХ ВЫЗОВОВ (Value Equality Cut)
    if (details && 'from' in details && 'to' in details) {
      if (this.isDeepEqual(details.from, details.to)) {
        // ⚛️ ФИКС: Выводим холостые pull-вызовы вычислений ИСКЛЮЧИТЕЛЬНО в режиме тонкой отладки кэша!
        if (type === 'computed') {
          // if (engineLogger.isCoreOptimizationDebugEnabled) {
          //   queueLogFn(type, `🔵 [IDLE PULL] ${label} (Значение кэша не изменилось)`, details);
          // }
          queueLogFn(type, `🔵 [IDLE PULL] ${label} (Значение кэша не изменилось)`, details)
          return
        }
        // Для остальных типов (batch, effect) холостой мусор полностью глушим
        return
      }
    }

    // 2. SIGNAL CHURN DETECTION: Обсчет частоты обновлений и дребезга
    let churnInfo = ''
    if (type === 'signal' || type === 'resource' || type === 'computed') {
      const churn = this.analyzeSignalChurn(label)
      churnInfo = churn.marker === '🟢' ? ` ${churn.marker}` : ` ${churn.marker} ${churn.info}`
    }

    // Отправляем очищенный лог в системную очередь
    queueLogFn(type, `${label}${churnInfo}`, details)
  }

}

