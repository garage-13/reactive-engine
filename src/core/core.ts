import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType, CleanupFn, TransactionContext, LogRecord, SignalOptions, ResourceOptions, ResourceState, Resource } from './types'
import { createComputed } from './core.method.computed'
import { createSignal } from './core.method.signal'
import { executeUntrack } from './core.method.untrack'
import { createReactive } from './core.method.reactive'
import { createEffect } from './core.method.effect'
import { ReactiveDebounceLogger } from './core.logger'

type Constructor<T> = new (...args: any[]) => T
type Factory<T> = (engine: any) => T
type InjectionToken<T> = Constructor<T> | Factory<T> | symbol | string

export class ReactiveEngineCore {
  protected frameworkPrefix = 'core'
  private logger: EngineLoggerOptions
  public epoch = 0
  public activeConsumer: any = null
  public batchDepth = 0
  public subscriberId = 0
  public pendingEffects: Array<Set<any> | undefined> = []
  public maxPendingDepth = 0
  public computedCache = new WeakMap<Function, any>()
  public computedStringCache = new Map<string, any>()
  private diRegistry = new Map<unknown, unknown>()
  private diCache = new Map<unknown, unknown>()
  private proxyCache = new WeakMap<object, any>()
  private proxyTargets = new WeakSet<object>()
  private reactiveSignals = new WeakMap<object, Map<string | symbol, any>>()
  public cycleDetectionStack = new Set<unknown>()
  public batchedSignals = new Set<any>()
  public activeOwner: any = null
  public pendingCleanups = new Set<() => void>()
  public isLoggingEnabled = false
  public _poolArr: any[] = []

  public queueCleanup(cleanup: () => void): void {
    this.pendingCleanups.add(cleanup)
  }

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
    this.isLoggingEnabled = !!this.logger.isEnabled
  }

  public scheduleEffect(effect: any): void {
    // ⚛️ ЖЕЛЕЗНЫЙ ДЕДУПЛИКАТОР: Если флаг взведен, эффект уже в очереди!
    if (effect._isScheduled) {
      return
    }
    effect._isScheduled = true

    const depth = effect.depth || 0
    if (!this.pendingEffects[depth]) {
      this.pendingEffects[depth] = new Set()
    }
    this.pendingEffects[depth]!.add(effect)
    if (depth > this.maxPendingDepth) {
      this.maxPendingDepth = depth
    }
  }

  public batch<T>(fn: () => T): T {
    this.batchDepth++
    try {
      return fn()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        if (!(this as any).batchIterationId) (this as any).batchIterationId = 0
        ;(this as any).batchIterationId++

        if (this.batchedSignals.size > 0) {
          const changeFlags = new Map<any, boolean>()

          // Фаза 1: Фиксация версий
          for (const sig of this.batchedSignals) {
            if (sig._applyBatchValue) {
              changeFlags.set(sig, sig._applyBatchValue())
            }
          }

          // Атомарный сдвиг общей макро-эпохи ядра
          this.epoch++

          // Фаза 2: Каскадный пуш со статусом CHECK (1)
          for (const sig of this.batchedSignals) {
            if (sig._flushBatch) {
              const changed = changeFlags.get(sig) ?? false
              sig._flushBatch(changed, true)
            }
          }
          this.batchedSignals.clear()
        }

        // Запускаем планировщик под единым защищенным барьером итерации
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

          // Сбрасываем флаг планировщика строго перед вызовом тела
          effect._isScheduled = false

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
            throw err
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

  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    return createSignal<T>(this, initialValue, optionsOrName)
  }

  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
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

  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>,
  ): Resource<T> {
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
    const resourceSignalName = isOptionsObject ? ((optionsOrName as ResourceOptions<T, S>).name || 'unnamed_resource') : (optionsOrName as string) || 'unnamed_resource'

    const options: Partial<ResourceOptions<T, S>> = isOptionsObject ? (optionsOrName as ResourceOptions<T, S>) : {}
    const resetDataOnSourceChange = options.resetDataOnSourceChange ?? true
    const responseValidate = options.responseValidate
    const validateBeforeFetch = options.validateBeforeFetch

    const state = this.signal<ResourceState<T>>(
      { data: null, loading: true, error: null, isRetrying: false },
      `[CORE_INTERNAL_SIGNAL=1]:resource:state:${resourceSignalName}`
    )

    const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
      if (effectSignal.aborted) return
      if (validateBeforeFetch) {
        const preValidationResult = validateBeforeFetch(sValue)
        if (preValidationResult === false || typeof preValidationResult === 'string') {
          if (effectSignal.aborted) return
          const errorMsg = typeof preValidationResult === 'string' ? preValidationResult : 'Pre-fetch validation failed'
          state.value = { data: isSourceChange ? null : state.value.data, loading: false, error: errorMsg, isRetrying: false }
          return
        }
      }

      state.value = { data: (isSourceChange && resetDataOnSourceChange) ? null : state.value.data, loading: true, error: null, isRetrying: false }

      try {
        const data = await fetcher(sValue, effectSignal)
        if (effectSignal.aborted) return
        if (responseValidate) {
          const validationResult = responseValidate(data)
          if (validationResult === false || typeof validationResult === 'string') {
            const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
            state.value = { data: null, loading: false, error: errorMsg, isRetrying: false }
            return
          }
        }
        state.value = { data, loading: false, error: null, isRetrying: false }
      } catch (e: any) {
        if (effectSignal.aborted) return
        state.value = { data: null, loading: false, error: e.message || 'Fetch error', isRetrying: false }
      }
    }

    let activeController: AbortController | null = null

    this.effect(() => {
      const sValue = source ? source.value : undefined as S
      const controller = new AbortController()
      activeController = controller

      this.untrack(() => {
        load(sValue, controller.signal, true)
      })

      return () => controller.abort()
    })

    return {
      get data() { return state.value.data },
      get loading() { return state.value.loading },
      get error() { return state.value.error },
      get isRetrying() { return state.value.isRetrying },
      get value() { return state.value },
      refetch: () => {
        activeController?.abort()
        const controller = new AbortController()
        activeController = controller
        load(source ? source.value : undefined as S, controller.signal, false)
      },
      subscribe: (cb: (val: ResourceState<T>) => void) => state.subscribe(cb)
    }
  }

}

export class ReactiveEngineAutomatic extends ReactiveEngineCore {}
