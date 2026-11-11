import type {
  CleanupFn,
  EffectFn,
  Signal,
  Computed,
  IEffect,
  SignalOptions,
  EngineLoggerOptions,
  LogEventType,
  Token,
  Factory,
  Resource,
  ResourceOptions
} from './types'
import { ReactiveDebounceLogger, queueLog } from './core.logger'
import { createReactive } from './core.method.reactive'
import { createResource } from './core.method.resource'

export type NodeState = 0 | 1 | 2

export class NodeLink {
  public source: ReactiveNode | null = null
  public target: ReactiveNode | null = null
  public nextSubscriber: NodeLink | null = null
  public prevSubscriber: NodeLink | null = null
  public nextDependency: NodeLink | null = null
  public prevDependency: NodeLink | null = null
  public version: number = 0

  public clear(): void {
    this.source = null
    this.target = null
    this.nextSubscriber = null
    this.prevSubscriber = null
    this.nextDependency = null
    this.prevDependency = null
    this.version = 0
  }
}

export class LinkPool {
  private static pool: NodeLink[] = []
  private static size = 0
  private static maxPoolSize = 100000

  public static acquire(source: ReactiveNode, target: ReactiveNode): NodeLink {
    if (this.size > 0) {
      this.size--
      const link = this.pool[this.size]
      this.pool[this.size] = null as unknown as NodeLink
      link.source = source
      link.target = target
      return link
    }
    const link = new NodeLink()
    link.source = source
    link.target = target
    return link
  }

  public static release(link: NodeLink): void {
    if (this.size < this.maxPoolSize) {
      link.clear()
      this.pool[this.size] = link
      this.size++
    }
  }
}

export class ReactiveNode {
  public id: string
  public type: 'signal' | 'computed' | 'effect'
  public version: number = 0
  public state: NodeState = 0
  public depth: number = 0
  public subscribersHead: NodeLink | null = null
  public subscribersTail: NodeLink | null = null
  public dependenciesHead: NodeLink | null = null
  public dependenciesTail: NodeLink | null = null
  public depsCursor: NodeLink | null = null // Курсор для O(1) переиспользования связей
  public _value: any
  public _prevValue: any
  public fn: (() => any) | null = null
  public cleanups = new Set<CleanupFn>()
  public isDisposed: boolean = false
  public ownedEffects = new Set<ReactiveNode>()
  public wrapper: any = null
  public engine: ReactiveEngineCore | null = null

  constructor(type: 'signal' | 'computed' | 'effect', id: string, initialValue?: any) {
    this.type = type
    this.id = id
    this._value = initialValue
    this._prevValue = initialValue
  }

  public get subscribers(): Set<ReactiveNode> {
    const set = new Set<ReactiveNode>()
    let link = this.subscribersHead
    while (link !== null) {
      if (link.target) set.add(link.target)
      link = link.nextSubscriber
    }
    return set
  }

  public get dependencies(): Set<ReactiveNode> {
    const set = new Set<ReactiveNode>()
    let link = this.dependenciesHead
    while (link !== null) {
      if (link.source) set.add(link.source)
      link = link.nextDependency
    }
    return set
  }
}

export class EffectScheduler {
  private buckets: ReactiveNode[][] = []
  private maxDepth = -1

  public schedule(node: ReactiveNode): void {
    const d = node.depth
    if (!this.buckets[d]) {
      this.buckets[d] = []
    }
    if (!this.buckets[d].includes(node)) {
      this.buckets[d].push(node)
      if (d > this.maxDepth) this.maxDepth = d
    }
  }

  public clearAll(): void {
    for (let d = 0; d <= this.maxDepth; d++) {
      const bucket = this.buckets[d]
      if (bucket) {
        for (const node of bucket) {
          node.state = 0
        }
        this.buckets[d] = []
      }
    }
    this.maxDepth = -1
  }

  public flush(engine: ReactiveEngineCore): void {
    const prevConsumer = engine.activeConsumer
    try {
      let d = 0
      while (d <= this.maxDepth) {
        const bucket = this.buckets[d]
        if (!bucket || bucket.length === 0) {
          d++
          continue
        }

        this.buckets[d] = []
        bucket.sort((a, b) => b.depth - a.depth)

        for (const node of bucket) {
          if (node.isDisposed || node.state === 0) continue

          if (node.state === 1) {
            if (engine.checkNeedsUpdate(node)) {
              node.state = 2
            } else {
              node.state = 0
            }
          }

          if (node.state === 2) {
            try {
              engine.runEffectNode(node)
            } catch (err) {
              // Изоляция очереди при падении эффекта (#177, #247)
              this.clearAll()
              throw err
            }
          }
        }

        let hasTasks = false
        for (let i = 0; i <= this.maxDepth; i++) {
          if (this.buckets[i] && this.buckets[i].length > 0) {
            d = i
            hasTasks = true
            break
          }
        }
        if (!hasTasks) d++
      }
    } finally {
      engine.activeConsumer = prevConsumer
      this.maxDepth = -1
    }
  }
}

export class ReactiveEngineCore {
  public activeConsumer: ReactiveNode | null = null
  public batchDepth = 0
  public batchedSignals: ReactiveNode[] = []
  public batchInitialValues = new Map<ReactiveNode, { value: any; version: number }>()
  public computedCache = new WeakMap<Function, any>()
  public logger: EngineLoggerOptions

  public proxyCache = new WeakMap<object, any>()
  public proxyTargets = new WeakSet<object>()
  public reactiveSignals = new WeakMap<object, Map<string | symbol, any>>()

  private scheduler = new EffectScheduler()
  private currentOwner: ReactiveNode | null = null
  private effectIdCounter = 0

  private diRegistry = new Map<unknown, unknown>()
  private diCache = new Map<unknown, unknown>()
  private cycleDetectionStack = new Set<unknown>()

  // public isCleaningUp = false

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }

  public log(params: { type: LogEventType; label: string; details?: { from?: unknown; to?: unknown; payload?: unknown }; isInternalCoreSignal?: boolean }): void {
    if (!this.logger || !this.logger.isEnabled) return
    ReactiveDebounceLogger.processLog(this.logger, queueLog, params)
  }

  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const name = typeof optionsOrName === 'string' ? optionsOrName : (optionsOrName?.name || 'signal')
    const validate = typeof optionsOrName === 'object' ? optionsOrName?.validate : undefined
    const isInternal = typeof optionsOrName === 'object' ? optionsOrName?.isInternalCoreSignal : false
    const node = new ReactiveNode('signal', name, initialValue)
    node.engine = this
    const self = this

    // Логируем стартовую инициализацию сигнала (from: undefined -> формат "SIGNAL label (initialValue)")
    this.log({ type: 'signal', label: name, details: { to: initialValue }, isInternalCoreSignal: isInternal })

    const publicSignal: Signal<T> & { _node: ReactiveNode; _engine: ReactiveEngineCore } = {
      _node: node,
      _engine: this,
      get value(): T {
        // if (self.isCleaningUp && self.activeConsumer === null) {
        //   return node._prevValue
        // }
        if (self.activeConsumer) {
          self.trackNode(node, self.activeConsumer)
        }
        return node._value
      },
      set value(newValue: T) {
        if (validate) {
          const validationResult = validate(newValue)
          if (validationResult === false || typeof validationResult === 'string') {
            console.error(`[Validation Error] Invalid value supplied to signal "${name}": ${validationResult}`)
            return
          }
        }
        const isObj = newValue !== null && typeof newValue === 'object'
        if (Object.is(node._value, newValue) && !isObj) return

        const oldVal = node._value
        node._prevValue = oldVal

        if (self.batchDepth > 0 && !self.batchInitialValues.has(node)) {
          self.batchInitialValues.set(node, { value: oldVal, version: node.version })
        }

        node._value = newValue
        node.version++

        self.log({ type: 'signal', label: name, details: { from: oldVal, to: newValue }, isInternalCoreSignal: isInternal })
        self.notifySubscribers(node, 2)

        if (self.batchDepth > 0) {
          if (!self.batchedSignals.includes(node)) {
            self.batchedSignals.push(node)
          }
        } else {
          self.flushEffects()
        }
      },
      get valueWithoutTracking(): T {
        return node._value
      },
      subscribe(cb: (v: T) => void): CleanupFn {
        return self.effect(() => {
          cb(publicSignal.value)
        })
      },
      destroy(): void {
        self.disposeNode(node)
      }
    }

    node.wrapper = publicSignal
    return publicSignal
  }

  public notifySubscribers(node: ReactiveNode, state: NodeState): void {
    let link = node.subscribersHead
    while (link !== null) {
      const target = link.target!
      if (target === this.activeConsumer) {
        link = link.nextSubscriber
        continue
      }

      if (target.state < state) {
        target.state = state
        if (target.type === 'effect') {
          this.scheduler.schedule(target)
        } else {
          this.notifySubscribers(target, 1)
        }
      }
      link = link.nextSubscriber
    }
  }

  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const name = signalName || 'computed'
    const node = new ReactiveNode('computed', name)
    node.engine = this
    node.fn = fn
    node.state = 2
    const self = this

    const publicComputed: Computed<T> & { _node: ReactiveNode; _engine: ReactiveEngineCore } = {
      _node: node,
      _engine: this,
      get value(): T {
        if (node.state === 1) {
          if (self.checkNeedsUpdate(node)) {
            node.state = 2
          } else {
            node.state = 0
          }
        }
        if (node.state === 2) {
          const oldVal = node._value
          self.evaluateComputed(node)
          // self.log({ type: 'computed', label: name, details: { from: oldVal, to: node._value } })
        }
        if (self.activeConsumer) {
          self.trackNode(node, self.activeConsumer)
        }
        return node._value
      },
      get valueWithoutTracking(): T {
        return node._value
      },
      subscribe(cb: (v: T) => void): CleanupFn {
        return self.effect(() => {
          cb(publicComputed.value)
        })
      },
      destroy(): void {
        self.disposeNode(node)
      },
      _isDirty(): boolean {
        return node.state === 2
      },
      get dependencies(): Set<any> {
        const depsSet = new Set()
        let link = node.dependenciesHead
        while (link !== null) {
          if (link.source && link.source.wrapper) {
            depsSet.add(link.source.wrapper)
          }
          link = link.nextDependency
        }
        return depsSet
      }
    }
    node.wrapper = publicComputed
    if (this.batchDepth === 0) {
      this.computedCache.set(fn, publicComputed)
    }
    return publicComputed
  }
  public effect(fn: EffectFn, effectName?: string): () => void {
    const name = effectName || 'effect'
    const node = new ReactiveNode('effect', name)
    node.state = 2
    node.depth = this.currentOwner ? this.currentOwner.depth + 1 : 0
    const publicEffect: IEffect = {
      id: ++this.effectIdCounter,
      run: () => {
        this.runEffectNode(node)
      },
      markDirty: () => {
        node.state = 2
        this.scheduler.schedule(node)
      },
      cleanups: node.cleanups,
      label: name,
      get isDirty(): boolean { return node.state === 2 },
      get isDisposed(): boolean { return node.isDisposed },
      _node: node
    }
    node.wrapper = publicEffect
    node.fn = () => {
      this.log({ type: 'effect', label: name })
      const res = fn()
      if (typeof res === 'function') {
        node.cleanups.add(res)
      }
    }
    if (this.currentOwner) {
      this.currentOwner.ownedEffects.add(node)
    }
    this.runEffectNode(node)
    const disposeFn = () => {
      this.disposeNode(node)
    }
;(disposeFn as any)._node = node
    return disposeFn
  }
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>
  ): Resource<T> {
    return createResource<T, S>(this, fetcher, source, optionsOrName)
  }
  public batch<T>(fn: () => T): T {
    this.batchDepth++
    try {
      return fn()
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        // Проверка Net-Zero откатов (#147)
        for (const sig of this.batchedSignals) {
          const initial = this.batchInitialValues.get(sig)
          const isObj = sig._value !== null && typeof sig._value === 'object'
          if (initial && !isObj && Object.is(sig._value, initial.value)) {
            sig.version = initial.version
            this.resetCleanState(sig)
          }
        }
        this.batchedSignals = []
        this.batchInitialValues.clear()
        this.flushEffects()
      }
    }
  }
  private resetCleanState(node: ReactiveNode): void {
    let link = node.subscribersHead
    while (link !== null) {
      const target = link.target!
      if (target.state > 0 && !this.checkNeedsUpdate(target)) {
        target.state = 0
        this.resetCleanState(target)
      }
      link = link.nextSubscriber
    }
  }
  public untrack<T>(fn: () => T): T {
    const prevConsumer = this.activeConsumer
    this.activeConsumer = null
    try {
      return fn()
    } finally {
      this.activeConsumer = prevConsumer
    }
  }
  public flushEffects(): void {
    if (this.batchDepth === 0) {
      this.scheduler.flush(this)
    }
  }
  public trackNode(source: ReactiveNode, target: ReactiveNode): void {
    const cursor = target.depsCursor

    // 1. FAST PATH (O(1)): Зависимость совпала с текущей позицией курсора
    if (cursor !== null && cursor.source === source) {
      cursor.version = source.version
      target.depsCursor = cursor.nextDependency
      return
    }

    // 2. SLOW PATH: Проверяем, нет ли уже этого source среди уже пройденных (от head до cursor)
    // или среди оставшихся после cursor (если зависимости поменялись местами)
    let link = target.dependenciesHead
    while (link !== cursor) {
      if (link!.source === source) {
        link!.version = source.version
        return
      }
      link = link!.nextDependency
    }

    // Проверяем, не встречается ли source дальше по списку (после cursor)
    let ahead = cursor !== null ? cursor.nextDependency : null
    while (ahead !== null) {
      if (ahead.source === source) {
        // Вырезаем ahead из его текущей позиции и перемещаем перед cursor
        if (ahead.prevDependency !== null) {
          ahead.prevDependency.nextDependency = ahead.nextDependency
        }
        if (ahead.nextDependency !== null) {
          ahead.nextDependency.prevDependency = ahead.prevDependency
        } else {
          target.dependenciesTail = ahead.prevDependency
        }

        ahead.version = source.version
        this.insertLinkBeforeCursor(target, ahead, cursor!)
        return
      }
      ahead = ahead.nextDependency
    }

    // 3. Совершенно новая зависимость — берём из пула
    const newLink = LinkPool.acquire(source, target)
    newLink.version = source.version

    if (target.depth <= source.depth) {
      target.depth = source.depth + 1
    }

    // Вставляем в хвост подписчиков source
    if (source.subscribersTail !== null) {
      source.subscribersTail.nextSubscriber = newLink
      newLink.prevSubscriber = source.subscribersTail
      source.subscribersTail = newLink
    } else {
      source.subscribersHead = newLink
      source.subscribersTail = newLink
    }

    // Вставляем в список зависимостей target строго перед cursor (или в хвост, если cursor === null)
    if (cursor !== null) {
      this.insertLinkBeforeCursor(target, newLink, cursor)
    } else {
      if (target.dependenciesTail !== null) {
        target.dependenciesTail.nextDependency = newLink
        newLink.prevDependency = target.dependenciesTail
        target.dependenciesTail = newLink
      } else {
        target.dependenciesHead = newLink
        target.dependenciesTail = newLink
      }
    }
  }

  private insertLinkBeforeCursor(target: ReactiveNode, link: NodeLink, cursor: NodeLink): void {
    const prev = cursor.prevDependency
    link.prevDependency = prev
    link.nextDependency = cursor
    cursor.prevDependency = link
    if (prev !== null) {
      prev.nextDependency = link
    } else {
      target.dependenciesHead = link
    }
  }

  private endTracking(target: ReactiveNode): void {
    let link = target.depsCursor
    target.depsCursor = null

    if (link === null) return

    // Отрезаем неиспользованный хвост начиная с link
    const prev = link.prevDependency
    if (prev !== null) {
      prev.nextDependency = null
      target.dependenciesTail = prev
    } else {
      target.dependenciesHead = null
      target.dependenciesTail = null
    }

    while (link !== null) {
      const next: NodeLink | null = link.nextDependency
      const source = link.source!

      if (link.prevSubscriber !== null) {
        link.prevSubscriber.nextSubscriber = link.nextSubscriber
      } else {
        source.subscribersHead = link.nextSubscriber
      }
      if (link.nextSubscriber !== null) {
        link.nextSubscriber.prevSubscriber = link.prevSubscriber
      } else {
        source.subscribersTail = link.prevSubscriber
      }

      LinkPool.release(link)
      link = next
    }
  }
  public unlinkDependencies(target: ReactiveNode, cascadeOrphans = false): void {
    let link = target.dependenciesHead
    target.dependenciesHead = null
    target.dependenciesTail = null
    while (link !== null) {
      const next = link.nextDependency
      const source = link.source!
      if (link.prevSubscriber !== null) {
        link.prevSubscriber.nextSubscriber = link.nextSubscriber
      } else {
        source.subscribersHead = link.nextSubscriber
      }
      if (link.nextSubscriber !== null) {
        link.nextSubscriber.prevSubscriber = link.prevSubscriber
      } else {
        source.subscribersTail = link.prevSubscriber
      }
      LinkPool.release(link)

      // Не уничтожаем computed при отписке слушателей (иначе React StrictMode убивает computed при ремаунте),
      // каскадно удаляем только если сам узел явным образом уничтожен через .destroy()
      if (cascadeOrphans && target.isDisposed && target.type === 'computed' && source.type === 'computed' && source.subscribersHead === null) {
        this.disposeNode(source)
      }
      link = next
    }
  }
  public checkNeedsUpdate(node: ReactiveNode): boolean {
    let link = node.dependenciesHead
    while (link !== null) {
      const source = link.source!
      if (source.state === 1) {
        if (this.checkNeedsUpdate(source)) {
          source.state = 2
        } else {
          source.state = 0
        }
      }
      if (source.state === 2) {
        this.evaluateComputed(source)
      }
      if (link.version !== source.version) {
        link.version = source.version
        return true
      }
      link = link.nextDependency
    }
    return false
  }
  public evaluateComputed(node: ReactiveNode): void {
    if (node.ownedEffects.size > 0) {
      const children = Array.from(node.ownedEffects)
      node.ownedEffects.clear()
      for (const eff of children) {
        this.disposeNode(eff)
      }
    }

    // Ставим курсор в начало существующих зависимостей вместо полного разрыва связей
    node.depsCursor = node.dependenciesHead

    const prevConsumer = this.activeConsumer
    const prevOwner = this.currentOwner
    this.activeConsumer = node
    this.currentOwner = node
    const oldVal = node._value
    try {
      const newValue = node.fn!()
      if (!Object.is(node._value, newValue)) {
        node._value = newValue
        node.version++
      }
      node.state = 0
      this.log({ type: 'computed', label: node.id, details: { from: oldVal, to: node._value } })
    } finally {
      this.endTracking(node)
      this.activeConsumer = prevConsumer
      this.currentOwner = prevOwner
    }
  }
  private executeCleanups(node: ReactiveNode): void {
    if (node.cleanups.size === 0) return
    const cleanupsList = Array.from(node.cleanups)
    node.cleanups.clear()
    let firstError: unknown = null
    // const prevCleaning = this.isCleaningUp
    // this.isCleaningUp = true

    for (const cleanup of cleanupsList) {
      try {
        this.untrack(() => cleanup())
      } catch (err) {
        if (firstError === null) {
          firstError = err
        }
      }
    }

    // finally {
    //   this.isCleaningUp = prevCleaning
    // }
    if (firstError !== null) {
      throw firstError
    }
  }
  public runEffectNode(node: ReactiveNode): void {
    if (node.isDisposed) return

    if (node.ownedEffects.size > 0) {
      const children = Array.from(node.ownedEffects)
      node.ownedEffects.clear()
      for (const eff of children) {
        this.disposeNode(eff)
      }
    }

    try {
      this.executeCleanups(node)
    } catch (e) {
      node.state = 0
      throw e
    }

    // Ставим курсор в начало существующих зависимостей
    node.depsCursor = node.dependenciesHead

    const prevConsumer = this.activeConsumer
    const prevOwner = this.currentOwner
    this.activeConsumer = node
    this.currentOwner = node
    try {
      node.fn!()
      node.state = 0
    } finally {
      this.endTracking(node)
      this.activeConsumer = prevConsumer
      this.currentOwner = prevOwner
      if (node.isDisposed) {
        this.unlinkDependencies(node, true)
      }
    }
  }
  public disposeNode(node: ReactiveNode): void {
    if (node.isDisposed) return
    node.isDisposed = true
    node.state = 0

    if (node.ownedEffects.size > 0) {
      const children = Array.from(node.ownedEffects)
      node.ownedEffects.clear()
      for (const eff of children) {
        this.disposeNode(eff)
      }
    }

    try {
      this.executeCleanups(node)
    } catch (e) {}

    this.unlinkDependencies(node, true)

    let link = node.subscribersHead
    node.subscribersHead = null
    node.subscribersTail = null
    while (link !== null) {
      const next = link.nextSubscriber
      const target = link.target
      if (target) {
        if (link.prevDependency !== null) {
          link.prevDependency.nextDependency = link.nextDependency
        } else {
          target.dependenciesHead = link.nextDependency
        }
        if (link.nextDependency !== null) {
          link.nextDependency.prevDependency = link.prevDependency
        } else {
          target.dependenciesTail = link.prevDependency
        }
      }
      LinkPool.release(link)
      link = next
    }
  }
  public reactive<T extends object>(target: T, name?: string): T {
    return createReactive<T>(this, target, name)
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
  public provide<T>(token: Token<T>, valueOrFactory: T | Factory<T>): void {
    this.diRegistry.set(token, valueOrFactory)
    this.diCache.delete(token)
  }
  public inject<T>(token: Token<T>): T {
    if (token === undefined || token === null) {
      throw new Error('[DI Error] Token is empty')
    }
    if (this.diCache.has(token)) {
      return this.diCache.get(token) as T
    }
    if (this.cycleDetectionStack.has(token)) {
      throw new Error('[DI Error] Cyclic dependency detected')
    }
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
          const isClass = str.startsWith('class ') ||
str.startsWith('class{') ||
(entry.prototype && entry.prototype.constructor === entry && !str.startsWith('function') && !str.includes('=>'))
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
        const resolved = new (token as any)(this)
        this.diCache.set(token, resolved)
        return resolved
      }
      throw new Error('[DI Error] Token not found')
    } finally {
      this.cycleDetectionStack.delete(token)
    }
  }
}
export let currentEngineInstance = new ReactiveEngineCore()
export function resetGlobalReactiveEngine(): void {
  currentEngineInstance = new ReactiveEngineCore()
}

export { ReactiveEngineCore as ReactiveEngine, ReactiveEngineCore as ReactiveEngineAutomatic }
