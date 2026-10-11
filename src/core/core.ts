import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType, CleanupFn, TransactionContext, LogRecord, SignalOptions } from './types'
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
  if (typeof value === 'object') return '{...}'
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
    if (hasTransition) logMessage += ` (${safeValueToString(record.from)} → ${safeValueToString(record.to)})`
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
  private cycleDetectionStack = new Set<any>()
  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }
  public shouldLog(type: LogEventType): boolean {
    if (!this.logger.isEnabled) return false
    const filter = this.logger.filter
    return typeof filter === 'string' ? (filter === '' || type.toLowerCase() === filter.toLowerCase()) : filter instanceof RegExp ? filter.test(type) : true
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
        if (engine.shouldLog('signal')) queueLog('signal', name || 'signal', { from: oldValue, to: newValue })
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
          const changed = isDirty || value !== newValue || isObj
          if (changed) {
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
          if (engine.shouldLog('computed')) queueLog('computed', signalName || 'computed')
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
    const cleanups = new Set<any>()
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
          if (engine.shouldLog('effect')) queueLog('effect', effectName || 'effect')
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
        if (engine.activeConsumer && engine.shouldLog('reactive')) queueLog('reactive', `Read ${name || ''}.${String(prop)}`, { payload: val })
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
        if (engine.shouldLog('reactive')) queueLog('reactive', `Update ${name || ''}.${String(prop)}`, { from: oldValue, to: rawValue })
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

  public provide(token: unknown, valueOrFactory: any): void {
    this.diRegistry.set(token, valueOrFactory)
    this.diCache.delete(token)
  }

  public inject<T = any>(token: unknown): T {
    if (token === undefined || token === null) throw new Error('[DI Error] Token is empty')
    if (this.diCache.has(token)) return this.diCache.get(token) as T
    if (this.cycleDetectionStack.has(token)) throw new Error('[DI Error] Cyclic dependency detected')
    this.cycleDetectionStack.add(token)
    try {
      if (this.diRegistry.has(token)) {
        const entry = this.diRegistry.get(token)
        if (typeof entry === 'function') {
          if ((entry as any)._isMockFunction) {
            const mockRes = (entry as any)(this)
            if (mockRes !== undefined) {
              this.diCache.set(token, mockRes)
              return mockRes
            }
            return entry as T
          }
          const str = entry.toString()
          const isClass = str.startsWith('class ') || str.startsWith('class{') || (entry.prototype && entry.prototype.constructor === entry && !str.startsWith('function') && !str.includes('=>'))
          if (!isClass) {
            const resolved = (entry as (eng: this) => T)(this)
            this.diCache.set(token, resolved)
            return resolved
          }
          return entry as T
        }
        return entry as T
      }
      if (typeof token === 'function') {
        const resolved = new (token as any)(this)
        this.diCache.set(token, resolved)
        return resolved
      }
      throw new Error('[DI Error] Token not found')
    } finally {
      this.cycleDetectionStack.delete(token)
    }
  }

  public resource<T, S>(fetcher: (source: S, abortSignal: AbortSignal) => Promise<T>, sourceSignal: Signal<S>): { data: T | null; loading: boolean; error: Error | null } {
    const engine = this
    let currentController: AbortController | null = null
    const resourceState = engine.reactive({ data: null as T | null, loading: true, error: null as Error | null }, 'resourceState')
    engine.effect(() => {
      const sourceValue = sourceSignal.value
      if (currentController) currentController.abort()
      currentController = new AbortController()
      resourceState.loading = true
      fetcher(sourceValue, currentController.signal)
        .then(data => {
          resourceState.data = data
          resourceState.loading = false
          resourceState.error = null
        })
        .catch(err => {
          if (err.name === 'AbortError' || err.message === 'aborted') return
          resourceState.error = err instanceof Error ? err : new Error(String(err))
          resourceState.loading = false
        })
    })
    return resourceState
  }
}

export { ReactiveEngineCore as ReactiveEngine, ReactiveEngineCore as ReactiveEngineAutomatic }
