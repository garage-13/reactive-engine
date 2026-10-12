import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType, CleanupFn, TransactionContext, LogRecord, SignalOptions, ResourceOptions, ResourceState, Resource } from './types'

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
  if (typeof value === 'object') return JSON.stringify(value)
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
        logMessage += `(${safeValueToString(record.from)} → ${safeValueToString(record.to)})`
      else logMessage += `(${safeValueToString(record.to)})`
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
    for (const effect of effects) {
      if (effect.isDirty && !effect.isDisposed) effect.run()
    }
  }
  public batch<R>(fn: () => R): R {
    this.batchDepth++
    try {
      return fn()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) this.flushEffects()
    }
  }
  private log ({ type, label, details }: { type: LogEventType, label: string, details?: { from?: unknown; to?: unknown; payload?: unknown } }) {
    const isEnabled = this.logger.isEnabled
    const isCoreOptimizationDebugEnabled = this.logger.isCoreOptimizationDebugEnabled
    const isInternalCoreSignal = getExtractedValues({
      tested: [label], expectedKey: 'CORE_INTERNAL_SIGNAL', valueType: 'number',
    })?.[0] === '1' || false
    if (isEnabled) {
      if (isInternalCoreSignal) {
        if (isCoreOptimizationDebugEnabled) queueLog(type, label, details)
      } else queueLog(type, label, details)
    }
  }
  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const engine = this
    let value = initialValue
    let version = 0
    const subscribers = new Set<any>()
    const name = typeof optionsOrName === 'string' ? optionsOrName : optionsOrName?.name || ''
    const signalNode = {
      subscribers,
      id: engine.subscriberId++,
      depth: 0,
      type: 'signal',
      get version() { return version }
    }
    const sigInstance = {
      get value() {
        if (engine.activeConsumer) {
          subscribers.add(engine.activeConsumer)
          engine.activeConsumer.dependencies.add(signalNode)
        }
        return value
      },
      set value(newValue: T) {
        const isObj = value && typeof value === 'object'
        if (value === newValue && !isObj) return
        if (optionsOrName && typeof optionsOrName === 'object' && optionsOrName.validate) {
          const validation = optionsOrName.validate(newValue)
          if (validation !== true) {
            console.error(typeof validation === 'string' ? validation : '[Validation Error]')
            return
          }
        }
        const oldValue = value
        value = newValue
        version++
        engine.epoch++
        engine.log({ type: 'signal', label: name || 'signal', details: { from: oldValue, to: newValue } })
        const markDirtyNode = (node: any) => {
          node.subscribers.forEach((sub: any) => {
            if (sub === engine.activeConsumer) return
            sub.isDirty = true
            if (sub.subscribers) markDirtyNode(sub)
            else engine.pendingEffects.add(sub)
          })
        }
        markDirtyNode(signalNode)
        if (engine.batchDepth === 0) engine.flushEffects()
      },
      get version() { return version },
      subscribe(cb: (val: T) => void): CleanupFn {
        const fakeEffect: any = {
          id: engine.subscriberId++,
          isDirty: true,
          depth: 9999,
          dependencies: new Set(),
          run: () => {
            if (fakeEffect.isDisposed) return
            try { cb(value) } catch (err) { console.error(err) }
          }
        }
        subscribers.add(fakeEffect)
        cb(value)
        return () => {
          fakeEffect.isDisposed = true
          subscribers.delete(fakeEffect)
        }
      }
    }
    ;(sigInstance as any)._node = signalNode
    return sigInstance as any
  }
  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const engine = this
    const cachedRef = engine.computedCache.get(fn)
    const existing = cachedRef?.deref()
    if (existing) return existing as Computed<T>
    let value: T
    let isDirty = true
    let version = 0
    const dependencies = new Set<any>()
    const subscribers = new Set<any>()
    const depVersions = new Map<any, number>()
    const computedNode: any = {
      id: engine.subscriberId++,
      dependencies,
      subscribers,
      depth: 1,
      type: 'computed',
      get version() { return version },
      run: () => {
        if (engine.cycleDetectionStack.has(computedNode)) throw new Error('[Graph Error] Cyclic dependency detected')
        engine.cycleDetectionStack.add(computedNode)
        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = computedNode
        dependencies.forEach(dep => dep.subscribers.delete(computedNode))
        dependencies.clear()
        depVersions.clear()
        try {
          const newValue = fn()
          const isObj = value && typeof value === 'object'
          const changed = isDirty || (!isObj && value !== newValue) || (isObj && JSON.stringify(value) !== JSON.stringify(newValue))
          if (changed) {
            if ((!isObj && value !== newValue) || (isObj && JSON.stringify(value) !== JSON.stringify(newValue))) {
              engine.log({ type: 'computed', label: signalName || 'unnamed_computed', details: { from: value, to: newValue } })
            }
            value = newValue
            version++
          }
          isDirty = false
          let maxDepDepth = 0
          dependencies.forEach(dep => {
            const rawNode = dep._node || dep
            depVersions.set(dep, rawNode.version !== undefined ? rawNode.version : engine.epoch)
            if (dep.depth !== undefined && dep.depth > maxDepDepth) maxDepDepth = dep.depth
          })
          computedNode.depth = maxDepDepth + 1
          return changed
        } finally {
          engine.activeConsumer = prevConsumer
          engine.cycleDetectionStack.delete(computedNode)
        }
      },
      markDirty: () => {
        if (!isDirty) {
          isDirty = true
          subscribers.forEach(sub => {
            if (sub.markDirty) sub.markDirty()
            else {
              sub.isDirty = true
              engine.pendingEffects.add(sub)
            }
          })
        }
      }
    }
    const computedInstance: Computed<T> = {
      get value() {
        if (engine.activeConsumer) {
          subscribers.add(engine.activeConsumer)
          computedNode.subscribers.add(engine.activeConsumer)
          engine.activeConsumer.dependencies.add(computedNode)
        }
        let needsUpdate = isDirty
        if (!needsUpdate && dependencies.size > 0) {
          const snapshotDeps = Array.from(dependencies)
          for (const dep of snapshotDeps) {
            const rawNode = (dep as any)._node || dep
            if (rawNode.type === 'computed' && (rawNode._isDirty ? rawNode._isDirty() : true)) {
              if (rawNode.run) rawNode.run()
            }
          }
          for (const dep of snapshotDeps) {
            const rawNode = (dep as any)._node || dep
            const currentVer = rawNode.version !== undefined ? rawNode.version : (dep.version !== undefined ? dep.version : engine.epoch)
            if (currentVer !== depVersions.get(dep)) {
              needsUpdate = true
              break
            }
          }
          if (!needsUpdate) {
            isDirty = false
          }
        }
        if (needsUpdate) {
          computedNode.run()
        }
        return value
      },
      get version() {
        return version
      },
      subscribe(cb: (val: T) => void): CleanupFn {
        const fakeEffect: any = {
          id: engine.subscriberId++,
          isDirty: true,
          depth: 9999,
          dependencies: new Set(),
          run: () => {
            if (fakeEffect.isDisposed) return
            try { cb(computedInstance.value) } catch (err) { console.error(err) }
          }
        }
        computedNode.subscribers.add(fakeEffect)
        cb(computedInstance.value)
        return () => {
          fakeEffect.isDisposed = true
          computedNode.subscribers.delete(fakeEffect)
          if (computedNode.subscribers.size === 0) {
            dependencies.forEach(dep => dep.subscribers.delete(computedNode))
            dependencies.clear()
            depVersions.clear()
            isDirty = true
          }
        }
      },
      subscribeState(cb: () => void): CleanupFn {
        return (computedInstance as any).subscribe(cb)
      },
      destroy: () => {
        subscribers.clear()
        computedNode.subscribers.clear()
        dependencies.forEach(dep => dep.subscribers.delete(computedNode))
        dependencies.clear()
        depVersions.clear()
        engine.computedCache.delete(fn)
        isDirty = true
      },
      __subscribe(cb: () => void): CleanupFn {
        return (computedInstance as any).subscribe(cb)
      }
    } as any
    ;(computedInstance as any)._node = computedNode
    computedInstance._isDirty = () => isDirty
    computedInstance.dependencies = dependencies
    computedInstance.type = 'computed'
    computedInstance.run = () => computedNode.run()
    engine.computedCache.set(fn, new WeakRef(computedInstance as any))
    return computedInstance
  }

  public effect(fn: () => void | CleanupFn, effectName?: string): () => void {
    const engine = this
    const cleanups = new Set<CleanupFn>()
    const dependencies = new Set<any>()
    const effectNode: any = {
      id: engine.subscriberId++,
      isDirty: true,
      depth: 1000,
      dependencies,
      cleanups,
      type: 'effect',
      run: () => {
        if (effectNode.isDisposed) return
        if (effectNode === engine.activeConsumer) return
        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = effectNode
        const prevDeps = new Set(dependencies)
        dependencies.clear()
        try {
          cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
          cleanups.clear()
          const cleanup = fn()
          if (typeof cleanup === 'function') cleanups.add(cleanup)
          effectNode.isDirty = false
          prevDeps.forEach(dep => {
            if (!dependencies.has(dep)) dep.subscribers.delete(effectNode)
          })
          engine.log({ type: 'effect', label: effectName || 'unnamed_effect' })
        } finally {
          engine.activeConsumer = prevConsumer
        }
      }
    }
    effectNode.run()
    return () => {
      effectNode.isDisposed = true
      cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
      cleanups.clear()
      dependencies.forEach(dep => dep.subscribers.delete(effectNode))
      dependencies.clear()
      engine.pendingEffects.delete(effectNode)
    }
  }

  public untrack<R>(fn: () => R): R {
    const prev = this.activeConsumer
    this.activeConsumer = null
    try {
      return fn()
    } finally {
      this.activeConsumer = prev
    }
  }

  public reactive<T extends object>(target: T, name?: string): T {
    const engine = this
    if (engine.proxyTargets.has(target)) return target
    if (engine.proxyCache.has(target)) return engine.proxyCache.get(target)
    if (!engine.reactiveSignals.has(target)) engine.reactiveSignals.set(target, new Map())
    const signalsMap = engine.reactiveSignals.get(target)!
    const handler: ProxyHandler<T> = {
      get(t: T, prop: string | symbol, receiver: any) {
        if (prop === '__subscribe' && Array.isArray(t)) {
          return (cb: () => void) => {
            let lengthSig = signalsMap.get('length')
            if (!lengthSig) {
              lengthSig = engine.signal(t.length)
              signalsMap.set('length', lengthSig)
            }
            return lengthSig.subscribe(cb)
          }
        }
        if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') return Reflect.get(t, prop, receiver)
        let sig = signalsMap.get(prop)
        if (!sig) {
          sig = engine.signal(Reflect.get(t, prop))
          signalsMap.set(prop, sig)
        }
        const val = sig.value
        if (engine.activeConsumer) engine.log({ type: 'reactive', label: `Read ${name || ''}.${String(prop)}`, details: { to: val } })
        if (val !== null && typeof val === 'object') return engine.reactive(val, name ? `${name}.${String(prop)}` : String(prop))
        return val
      },
      set(t: T, prop: string | symbol, value: any, receiver: any) {
        const rawValue = engine.proxyTargets.has(value) ? value : value
        const oldValue = Reflect.get(t, prop)
        if (oldValue === rawValue && prop !== 'length') return true
        Reflect.set(t, prop, rawValue)
        let sig = signalsMap.get(prop)
        if (!sig) {
          sig = engine.signal(oldValue)
          signalsMap.set(prop, sig)
        }
        sig.value = rawValue
        if (Array.isArray(t) && prop !== 'length') {
          let lengthSig = signalsMap.get('length')
          if (lengthSig) lengthSig.value = t.length
        }
        return true
      }
    }
    const proxy = new Proxy(target, handler)
    engine.proxyCache.set(target, proxy)
    engine.proxyTargets.add(proxy)
    return proxy
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
      if (isValid === false) {
        // Если валидатор вернул строго false — мы тихо блокируем старт фетчера,
        // переводя ресурс в состояние ПОКОЯ (loading: false, error: null).
        // Это полностью ликвидирует генерацию ложных ошибок при монтировании!
        state.value = {
          loading: false,
          data: null,
          error: null, // Ошибки нет! Стейт стабилен.
          isRetrying: false
        }
        return
      }
      if (typeof isValid === 'string') {
        // Если валидатор вернул строку — это боевая декларативная ошибка валидации формы.
        // Здесь мы честно переводим ресурс в стейт ошибки, как и требовалось ранее.
        state.value = {
          loading: false,
          data: null,
          error: 'Core internal stopper',
          isRetrying: false
        }
        return
      }
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
