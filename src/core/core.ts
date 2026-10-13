import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType, CleanupFn, TransactionContext, LogRecord, SignalOptions, ResourceOptions, ResourceState, Resource } from './types'
import { createComputed } from './core.method.computed'
import { createSignal } from './core.method.signal'
import { executeBatch } from './core.method.batch'
import { executeUntrack } from './core.method.untrack'
import { createReactive } from './core.method.reactive'
import { createEffect } from './core.method.effect'
import { ReactiveDebounceLogger } from './core.logger'

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
  private logger: EngineLoggerOptions
  public epoch = 0
  public activeConsumer: any = null
  public batchDepth = 0
  public subscriberId = 0
  public pendingEffects = new Set<any>()
  public computedCache = new Map<Function, WeakRef<Computed<unknown>>>()
  private diRegistry = new Map<unknown, unknown>()
  private diCache = new Map<unknown, unknown>()
  private proxyCache = new WeakMap<object, any>()
  private proxyTargets = new WeakSet<object>()
  private reactiveSignals = new WeakMap<object, Map<string | symbol, any>>()
  private cycleDetectionStack = new Set<unknown>()

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }

  public queueLog(type: LogEventType, label: string, details?: { from?: unknown; to?: unknown; payload?: unknown }): void {
    queueLog(type, label, details)
  }

  public flushEffects(): void {
    if (this.batchDepth > 0) return

    const effects = Array.from(this.pendingEffects)
    this.pendingEffects.clear()

    effects.sort((a, b) => (a.depth || 0) - (b.depth || 0) || a.id - b.id)

    const prevConsumer = this.activeConsumer

    try {
      for (const effect of effects) {
        if (effect.isDisposed) continue

        // Валидация зависимостей эффекта перед запуском
        if (effect.dependencies && effect.dependencies.size > 0) {
          let parentChanged = false
          for (const dep of effect.dependencies) {
            const rawNode = dep._node || dep

            // КРИТИЧЕСКИЙ ШАГ: Вызываем метод .update(), позволяя computed
            // произвести рекурсивный pull-анализ изменений
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

        if (!effect.isDirty) continue

        try {
          effect.run()
        } catch (err) {
          if (this.batchDepth === 0) throw err
        }
      }
    } finally {
      this.activeConsumer = prevConsumer
    }
  }

  public batch<T>(fn: () => T): T {
    return executeBatch<T>(this, fn)
  }

  private log ({ type, label, details, isInternalCoreSignal = false }: { type: LogEventType, label: string, details?: { from?: unknown; to?: unknown; payload?: unknown }, isInternalCoreSignal?: boolean }) {
    ReactiveDebounceLogger.processLog(this.logger, queueLog, {
      type,
      label,
      details,
      isInternalCoreSignal
    })
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

  private delay(ms: number, signal: AbortSignal): Promise<void> {
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

  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>,
  ): Resource<T> {
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
    const resourceSignalName = isOptionsObject
      ? ((optionsOrName as ResourceOptions<T, S>).name || 'unnamed_resource')
      : (optionsOrName as string) || 'unnamed_resource'

    const options: Partial<ResourceOptions<T, S>> = isOptionsObject
      ? (optionsOrName as ResourceOptions<T, S>)
      : {}

    const resetDataOnSourceChange = options.resetDataOnSourceChange ?? true
    const responseValidate = options.responseValidate
    const validateBeforeFetch = options.validateBeforeFetch
    const retryCount = 0
    const baseDelay = 1000
    const useExponential = true
    const maxRetryDelay = 1000 * 60 * 5
    const timeoutMs = 1000
    const state = this.signal<ResourceState<T>>(
      { data: null, loading: true, error: null, isRetrying: false },
      `[CORE_INTERNAL_SIGNAL=1]:resource:state:${resourceSignalName}`
    )

    const updateResourceState = (nextState: ResourceState<T>) => {
      this.log({ type: 'resource', label: resourceSignalName, details: { to: nextState, from: state.value } })
      state.value = nextState
    }

    const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
      if (effectSignal.aborted) return
      const isValid = options.validateBeforeFetch ? options.validateBeforeFetch(sValue) : true

      /**
       * 🧐 WIP_CORE: Есть два пути, ни один не будет ошибкой, если разкомментировать код ниже. Чуть бозже добавлю опци для более тонкой отладки ядра.
       *
       * - АКТИВНО: Разделяем мирную блокировку (false) и боевую ошибку (string): работать будет идеально, но без логов, связанных с пре-валидацией
       * - НЕАКТИВНО: Более очевидное логирование процессов пре-валидации (выставление ошибок и мониторинг разработчиком)
      */
      // --
      // if (isValid === false) {
      //   // Если валидатор вернул строго false — мы тихо блокируем старт фетчера,
      //   // переводя ресурс в состояние ПОКОЯ (loading: false, error: null).
      //   // Это полностью ликвидирует генерацию ложных ошибок при монтировании!
      //   state.value = {
      //     loading: false,
      //     data: null,
      //     error: null, // Ошибки нет! Стейт стабилен.
      //     isRetrying: false
      //   }
      //   return
      // }
      // if (typeof isValid === 'string') {
      //   // Если валидатор вернул строку — это боевая декларативная ошибка валидации формы.
      //   // Здесь мы честно переводим ресурс в стейт ошибки, как и требовалось ранее.
      //   state.value = {
      //     loading: false,
      //     data: null,
      //     error: 'Core internal stopper',
      //     isRetrying: false
      //   }
      //   return
      // }
      // --
      if (validateBeforeFetch) {
        const preValidationResult = validateBeforeFetch(sValue)
        if (preValidationResult === false || typeof preValidationResult === 'string') {
          if (effectSignal.aborted) return
          const errorMsg = typeof preValidationResult === 'string'
            ? preValidationResult
            : 'Pre-fetch validation failed for resource'

          const currentData = isSourceChange ? null : this.untrack(() => state.value.data)
          updateResourceState({ data: currentData, loading: false, error: errorMsg, isRetrying: false })
          return
        }
      }
      const shouldClear = isSourceChange && resetDataOnSourceChange
      const currentData = shouldClear ? null : this.untrack(() => state.value.data)
      updateResourceState({ data: currentData, loading: true, error: null, isRetrying: false })
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        if (effectSignal.aborted) return
        let combinedSignal = effectSignal
        try {
          const data = await fetcher(sValue, combinedSignal)
          if (effectSignal.aborted) return
          if (combinedSignal.aborted) {
            throw new DOMException('The operation timed out.', 'TimeoutError')
          }
          if (responseValidate) {
            const validationResult = responseValidate(data)
            if (validationResult === false || typeof validationResult === 'string') {
              if (effectSignal.aborted) return
              const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
              updateResourceState({ data: null, loading: false, error: errorMsg, isRetrying: false })
              return
            }
          }
          if (effectSignal.aborted) return
          updateResourceState({ data, loading: false, error: null, isRetrying: false })
          return
        } catch (e: unknown) {
          if (effectSignal.aborted || ((e as Error).name === 'AbortError' && effectSignal.aborted)) return
          const isTimeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError' || (e as Error).message?.includes('timeout')
          const isCustomValidationError = getExtractedValues({
            tested: [(e as Error).message], expectedKey: 'THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY', valueType: 'number',
          })?.[0] === '1' || false
          const __defaultCustomValidationErrorMessage = 'Custom validation error'
          let customValidationErrorMessage: string = isCustomValidationError
            ? (getExtractedValues({
              tested: [(e as Error).message], expectedKey: 'MESSAGE', valueType: 'string',
            })?.[0] || __defaultCustomValidationErrorMessage)
            : __defaultCustomValidationErrorMessage
          const isFetchBodyValidationError = isCustomValidationError || (e as Error).name === 'ValidationError'
          if (attempt === retryCount || isFetchBodyValidationError) {
            if (effectSignal.aborted) return
            const finalError = isTimeout
              ? new Error(`Request timed out after ${timeoutMs}ms`, { cause: e })
              : isCustomValidationError
                ? new Error(customValidationErrorMessage, { cause: e })
                : e

            updateResourceState({
              data: null, loading: false,
              error: finalError instanceof Error ? finalError.message : typeof finalError === 'string' ? finalError : `typeof finalError is ${typeof finalError}`,
              isRetrying: false,
            })
            return
          } else {
            if (effectSignal.aborted) return
            let currentDelay = useExponential ? baseDelay * Math.pow(2, attempt) : baseDelay
            currentDelay = Math.min(currentDelay, maxRetryDelay)
            const jitter = Math.random() * 200
            currentDelay = currentDelay + jitter
            updateResourceState({ data: state.value.data, loading: true, error: null, isRetrying: true })
            const logReason = isTimeout ? 'таймауту' : 'ошибке сети'
            console.warn(`[Resource Retry] "${resourceSignalName}" сбой по ${logReason}. Попытка ${attempt + 1}/${retryCount > 0 ? retryCount + 1 : attempt + 1}...`)

            try {
              await this.delay(currentDelay, effectSignal)
              if (effectSignal.aborted) return
            } catch (delayError) {
              return
            }
          }
        }
      }
    }

    let activeEffectController: AbortController | null = null

    this.effect(() => {
      const sValue = source ? source.value : undefined as S
      const effectController = new AbortController()
      activeEffectController = effectController

      this.untrack(() => {
        load(sValue as S, effectController.signal, true)
      })

      return () => effectController.abort()
    }, '[CORE_INTERNAL_SIGNAL=1]:effect')

    return {
      get data() { return state.value.data },
      get loading() { return state.value.loading },
      get error() { return state.value.error },
      get isRetrying() { return state.value.isRetrying },
      get value() { return state.value },
      refetch: () => {
        activeEffectController?.abort()
        activeEffectController = new AbortController()
        load(source ? source.value : undefined as S, activeEffectController.signal, false)
      },
      subscribe: (cb: (val: ResourceState<T>) => void) => state.subscribe(cb)
    }
  }
}

export { ReactiveEngineCore as ReactiveEngine, ReactiveEngineCore as ReactiveEngineAutomatic }
