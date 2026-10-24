// core.logger.ts
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
    // Фильтруем историю
    const activeHistory = history.filter(ts => ts > cutoff)
    activeHistory.push(now)

    const updateCount = activeHistory.length
    const intervalSec = (this.TIME_WINDOW_MS / 1000).toFixed(1)

    // ⚛️ ФИКС УТЕЧКИ ПАМЯТИ: Если узел стабилен и старых логов нет,
    // удаляем ключ из Map целиком, чтобы не копить мусор
    if (activeHistory.length <= 1) {
      this.churnTracker.delete(label)
      return { marker: '🟢', info: `[STABLE] (1 изм./${intervalSec}s)` }
    } else {
      this.churnTracker.set(label, activeHistory)
    }

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

    // ⚛️ ФИКС #1: Включаем валидацию RegExp фильтра из настроек
    if (engineLogger.filter) {
      const isMatch = engineLogger.filter instanceof RegExp
        ? engineLogger.filter.test(label)
        : label.includes(engineLogger.filter)
      if (!isMatch) return
    }

    if (isInternalCoreSignal && !engineLogger.isCoreOptimizationDebugEnabled) return

    if (details && 'from' in details && 'to' in details) {
      if (this.isDeepEqual(details.from, details.to)) {
      // ⚛️ ФИКС #2: Разрешаем логам типов 'resource' выводить IDLE транзакции,
      // иначе глубокое равенство объектов состояния блокирует их вывод
        if ((type === 'computed' || type === 'resource') && engineLogger.isCoreOptimizationDebugEnabled) {
          queueLogFn(type, `🔵 [IDLE] ${label}`, details)
          return
        }
        return
      }
    }

    let churnInfo = ''
    if (type === 'signal' || type === 'resource' || type === 'computed') {
      const churn = this.analyzeSignalChurn(label)
      churnInfo = churn.marker === '🟢' ? ` ${churn.marker}` : ` ${churn.marker} ${churn.info}`
    }

    queueLogFn(type, `${label}${churnInfo}`, details)
  }

}
