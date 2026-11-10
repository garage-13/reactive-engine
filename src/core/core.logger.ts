import { LogEventType, TransactionContext, LogRecord } from "./types"

interface LogDetails {
  from?: unknown;
  to?: unknown;
  payload?: unknown;
}

const badgeColors: Record<LogEventType, string> = {
  signal: 'background: #007acc; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  computed: 'background: #42b883; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  effect: 'background: #e01e5a; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  batch: 'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  resource: 'background: #d97706; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  reactive: 'background: #007acc; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;'
}

let currentTransaction: TransactionContext | null = null

function safeValueToString(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (e) {
      return '[Cyclic Object or Layer]'
    }
  }
  return String(value)
}

export function queueLog(type: LogEventType, label: string, details?: LogDetails): void {
  if (!currentTransaction) {
    currentTransaction = { id: Math.random().toString(36).substring(2, 9), pendingLogQueue: [], isFlushing: false }
    queueMicrotask(() => flushLogs())
  }
  currentTransaction.pendingLogQueue.push({
    type,
    label,
    from: details?.from,
    to: details?.to,
    payload: details?.payload,
    timestamp: Date.now()
  })
}

export function flushLogs(): void {
  if (!currentTransaction || currentTransaction.isFlushing) return
  currentTransaction.isFlushing = true
  const queue = currentTransaction.pendingLogQueue
  if (queue.length === 0) {
    currentTransaction = null
    return
  }
  console.groupCollapsed(`%cREACTIVE TRANSACTION%c [id: ${currentTransaction.id}] (${queue.length} operations)`, 'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;', 'color: #888; font-weight: normal;')
  for (const record of queue) {
    const colorStyle = badgeColors[record.type]
    const hasTransition = record.from !== undefined || record.to !== undefined
    let logMessage = `%c${record.type.toUpperCase()}%c ${record.label}`

    if (hasTransition) {
      if (record.from !== undefined)
        logMessage += ` ${safeValueToString(record.from)} → ${safeValueToString(record.to)}`
      else logMessage += ` (${safeValueToString(record.to)})`
    }

    if (record.payload !== undefined) {
      console.groupCollapsed(logMessage, colorStyle, 'color: inherit;')
      console.log('Payload:', record.payload)
      console.groupEnd()
    } else {
      console.log(logMessage, colorStyle, 'color: inherit;')
    }
  }
  console.groupEnd()
  currentTransaction = null
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

    const updateCount = activeHistory.length
    const intervalSec = (this.TIME_WINDOW_MS / 1000).toFixed(1)

    if (activeHistory.length <= 1) {
      this.churnTracker.delete(label)
      return { marker: '🟢', info: `[STABLE] (1 изм./${intervalSec}s)` }
    } else {
      this.churnTracker.set(label, activeHistory)
    }

    if (updateCount >= this.CHURN_CRITICAL_THRESHOLD) {
      return { marker: '🔴', info: `[CRITICAL CHURN] (${updateCount} изм./${intervalSec}s) — Нужен debounce!` }
    }
    if (updateCount >= this.CHURN_WARNING_THRESHOLD) {
      return { marker: '🟡', info: `[WARNING CHURN] (${updateCount} изм./${intervalSec}s)` }
    }
    return { marker: '🟢', info: `[STABLE] (${updateCount} изм./${intervalSec}s)` }
  }

  public static processLog(
    engineLogger: any,
    queueLogFn: Function,
    params: { type: LogEventType; label: string; details?: LogDetails; isInternalCoreSignal?: boolean }
  ) {
    const { type, label, details, isInternalCoreSignal = false } = params

    if (!engineLogger.isEnabled) return

    if (engineLogger.filter) {
      const isMatch = engineLogger.filter instanceof RegExp
        ? engineLogger.filter.test(label)
        : label.includes(engineLogger.filter)
      if (!isMatch) return
    }

    if (isInternalCoreSignal && !engineLogger.isCoreOptimizationDebugEnabled) return

    if (details && 'from' in details && 'to' in details) {
      if (this.isDeepEqual(details.from, details.to)) {
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
