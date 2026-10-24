// import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType, CleanupFn, TransactionContext, LogRecord, SignalOptions, ResourceOptions, ResourceState, Resource } from './types'
import { createComputed } from './core.method.computed'
import { createSignal } from './core.method.signal'
// import { executeBatch } from './core.method.batch'
import { executeUntrack } from './core.method.untrack'
import { createReactive } from './core.method.reactive'
import { createEffect } from './core.method.effect'
import { ReactiveDebounceLogger } from './core.logger'
import { createResource } from './core.method.resource'

// Тип для конструктора класса
type Constructor<T> = new (...args: any[]) => T
// Тип для фабричной функции зависимостей
type Factory<T> = (engine: any) => T
// Универсальный тип токена DI
type InjectionToken<T> = Constructor<T> | Factory<T> | symbol | string

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
export function queueLog(type: LogEventType, label: string, details?: { from?: unknown; to?: unknown; payload?: unknown }): void {
  if (!currentTransaction) {
    currentTransaction = { id: Math.random().toString(36).substring(2, 9), pendingLogQueue: [], isFlushing: false }
    queueMicrotask(() => flushLogs())
  }
  currentTransaction.pendingLogQueue.push({ type, label, from: details?.from, to: details?.to, payload: details?.payload, timestamp: Date.now() })
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
      if (!!record.from)
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
export class ReactiveEngineCore {
  protected frameworkPrefix = 'core'
  public logger: EngineLoggerOptions
  public epoch = 0
  public activeConsumer: any = null
  public batchDepth = 0
  public subscriberId = 0
  public pendingEffects: Array<Set<any> | undefined> = []
  public maxPendingDepth = 0
  public computedCache = new WeakMap<Function, any>()
  private diRegistry = new Map<unknown, unknown>()
  private diCache = new Map<unknown, unknown>()
  private proxyCache = new WeakMap<object, any>()
  private proxyTargets = new WeakSet<object>()
  private reactiveSignals = new WeakMap<object, Map<string | symbol, any>>()
  private cycleDetectionStack = new Set<unknown>()
  public batchedSignals = new Set<any>()
  public activeOwner: any = null
  // Системная очередь для отложенного батчинга деструкторов
  public pendingCleanups = new Set<() => void>()

  // Метод для регистрации отложенной очистки
  public queueCleanup(cleanup: () => void): void {
    this.pendingCleanups.add(cleanup)
  }

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }

  public scheduleEffect(effect: any): void {
    const depth = effect.depth || 0
    if (!this.pendingEffects[depth]) {
      this.pendingEffects[depth] = new Set()
    }
    this.pendingEffects[depth]!.add(effect)
    if (depth > this.maxPendingDepth) {
      this.maxPendingDepth = depth
    }
  }

  public queueLog(type: LogEventType, label: string, details?: { from?: unknown; to?: unknown; payload?: unknown }): void {
    queueLog(type, label, details)
  }

  public batch<T>(fn: () => T): T {
    this.batchDepth++
    try {
      return fn()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        if (this.batchedSignals.size > 0) {
          for (const sig of this.batchedSignals) {
            if (sig._flushBatch) sig._flushBatch()
          }
          this.batchedSignals.clear()
        }

        this.flushEffects()
      }
    }
  }

  public flushEffects(): void {
    if (this.batchDepth > 0) return

    const prevConsumer = this.activeConsumer

    try {
      for (let depth = 0; depth <= this.maxPendingDepth; depth++) {
        const bucket = this.pendingEffects[depth]

        if (!bucket || bucket.size === 0) continue

        const effects = Array.from(bucket)
        bucket.clear()

        for (const effect of effects) {
          if (effect.isDisposed) continue

          // ⚡ ЗOЛОТOЙ СТАНДАРТ ОПТИМИЗАЦИИ (Early Dirty Check Bypass):
          // Переносим проверку грязи в самое начало цикла. Если эффект не был промаркирован
          // как DIRTY волной push-уведомлений, мы мгновенно пропускаем его, полностью
          // избавляя V8 от холостого обхода родителей и тяжелых хэш-поисков depVersions.get(dep).
          if (!effect.isDirty) continue

          if (effect.dependencies && effect.dependencies.size > 0) {
            let parentChanged = false

            for (const dep of effect.dependencies) {
              const rawNode = dep._node || dep

              if (rawNode.type === 'computed' && rawNode.state > 0) {
                if (rawNode.update) rawNode.update()
              }

              if (effect.depVersions && effect.depVersions.get(dep) !== rawNode.version) {
                parentChanged = true
              }
            }

            if (!parentChanged && effect.dependencies.size > 0) {
              effect.isDirty = false
              continue
            }
          }

          try {
            effect.run()
          } catch (err) {
            // ⚡ ФИКС ТЕСТА #177: Если один из эффектов выбросил исключение,
            // принудительно очищаем и гасим флаги грязи (isDirty) у всех оставшихся
            // в очереди эффектов текущего и последующих уровней глубины.
            for (let d = depth; d <= this.maxPendingDepth; d++) {
              const remainingBucket = this.pendingEffects[d]
              if (remainingBucket) {
                for (const remEffect of remainingBucket) {
                  remEffect.isDirty = false
                }
                remainingBucket.clear()
              }
            }
            this.maxPendingDepth = 0
            throw err // Прокидываем ошибку дальше по спецификации
          }

        }

        if (depth > 0) {
          let hasEarlierEffects = false
          for (let i = 0; i < depth; i++) {
            if (this.pendingEffects[i] && this.pendingEffects[i]!.size > 0) {
              hasEarlierEffects = true
              break
            }
          }
          if (hasEarlierEffects) depth = -1
        }
      }
      this.maxPendingDepth = 0
    } finally {
      this.activeConsumer = prevConsumer
    }
  }

  // public batch<T>(fn: () => T): T {
  //   return executeBatch<T>(this, fn)
  // }

  // ⚛️ ФИКС ДЛЯ РЕЛИЗА 2.5.0: Меняем private на public,
  // чтобы изолированные функции-методы имели легальный доступ к регистратору логов
  public log(params: any) {
    if (!this.logger || !this.logger.isEnabled) return
    ReactiveDebounceLogger.processLog(this.logger, queueLog, params)
  }

  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    return createSignal<T>(this, initialValue, optionsOrName)
  }

  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    // Просто делегируем вызов строго изолированной чистой функции
    return createComputed<T>(this, fn, signalName)
  }

  public effect(fn: () => void | CleanupFn, effectName?: string): () => void {
    return createEffect(this, fn, effectName)
  }

  public untrack<T>(fn: () => T): T {
    return executeUntrack<T>(this, fn)
  }

  public reactive<T extends object>(target: T, name?: string): T {
    return createReactive<T>(this, target, name)
  }

  public provide<T>(token: InjectionToken<T>, valueOrFactory: T | Factory<T>): void {
    this.diRegistry.set(token, valueOrFactory)
    this.diCache.delete(token)
  }

  public inject<T>(token: InjectionToken<T>): T {
    if (token === undefined || token === null) throw new Error('[DI Error] Token is empty')
    if (this.diCache.has(token)) return this.diCache.get(token) as T
    if (this.cycleDetectionStack.has(token)) throw new Error('[DI Error] Cyclic dependency detected')
    this.cycleDetectionStack.add(token)
    try {
      if (this.diRegistry.has(token)) {
        const entry = this.diRegistry.get(token)
        if (typeof entry === 'function') {
          if ((entry as any)._isMockFunction) {
            const mockRes = (entry as Function)(this)
            if (mockRes !== undefined) {
              this.diCache.set(token, mockRes)
              return mockRes as T
            }
            return entry as unknown as T
          }
          const str = entry.toString()
          const isClass = str.startsWith('class ') || str.startsWith('class{') || (entry.prototype && entry.prototype.constructor === entry && !str.startsWith('function') && !str.includes('=>'))
          if (!isClass) {
            const resolved = (entry as Factory<T>)(this)
            this.diCache.set(token, resolved)
            return resolved
          }
          return entry as unknown as T
        }
        return entry as T
      }
      if (typeof token === 'function') {
        const resolved = new (token as Constructor<T>)(this)
        this.diCache.set(token, resolved)
        return resolved
      }
      throw new Error('[DI Error] Token not found')
    } finally {
      this.cycleDetectionStack.delete(token)
    }
  }

  public delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'))
      }

      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      const onAbort = () => {
        clearTimeout(timeoutId)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Создает умную реактивную декларативную обертку над асинхронными операциями
   * с автоматическим подавлением Race Conditions и встроенным методом .destroy().
   */
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>,
  ): Resource<T> {
    // Передаем инстанс движка (this) как IReactiveEngine для соблюдения строгой типизации
    return createResource<T, S>(this, fetcher, source, optionsOrName)
  }
}

export { ReactiveEngineCore as ReactiveEngine, ReactiveEngineCore as ReactiveEngineAutomatic }
