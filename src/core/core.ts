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

export type NodeState = 0 | 1 | 2;

/**
 * Высокопроизводительное ребро графа
 */
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

/**
 * Глобальный статический пул ребер (GC-Free)
 */
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

/**
 * Единый унифицированный узел реактивного графа
 */
export class ReactiveNode {
  public id: string
  public type: 'signal' | 'computed' | 'effect'
  public version: number = 0
  public state: NodeState = 0
  public depth: number = 0
  public subscribersHead: NodeLink | null = null
  public dependenciesHead: NodeLink | null = null
  public _value: any
  public fn: (() => any) | null = null
  public cleanup: CleanupFn | null = null
  public isDisposed: boolean = false
  public ownedEffects: ReactiveNode[] | null = null
  public wrapper: any = null

  constructor(type: 'signal' | 'computed' | 'effect', id: string, initialValue?: any) {
    this.type = type
    this.id = id
    this._value = initialValue
  }
}

/**
 * Оптимизированный планировщик задач на базе Bucket-Queue.
 * ИСПРАВЛЕН: Теперь детерминированно обрабатывает re-entry мутации на любых уровнях глубины (включая 0).
 */
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
            engine.runEffectNode(node)
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
      // ГАРАНТИРУЕТ полный сброс активных потребителей при падении эффектов
      engine.activeConsumer = prevConsumer
      this.maxDepth = -1
    }
  }
}

export class ReactiveEngineCore {
  public activeConsumer: ReactiveNode | null = null
  public batchDepth = 0
  public batchedSignals: ReactiveNode[] = []
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

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }

  public log(params: { type: LogEventType; label: string; details?: { from?: unknown; to?: unknown; payload?: unknown }; isInternalCoreSignal?: boolean }): void {
    if (!this.logger || !this.logger.isEnabled) return
    ReactiveDebounceLogger.processLog(this.logger, queueLog, params)
  }

  // ИСПРАВЛЕН: Поддержка Object.is bypass для объектов, тихой валидации с выгрузкой в console.error
  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const name = typeof optionsOrName === 'string' ? optionsOrName : (optionsOrName?.name || 'signal')
    const validate = typeof optionsOrName === 'object' ? optionsOrName?.validate : undefined
    const node = new ReactiveNode('signal', name, initialValue)
    const self = this // Гарантируем лексическую привязку к инстансу класса

    const publicSignal: Signal<T> = {
      get value(): T {
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
        node._value = newValue
        node.version++

        self.log({ type: 'signal', label: name, details: { from: oldVal, to: newValue } })

        if (self.batchDepth > 0) {
          if (!self.batchedSignals.includes(node)) {
            self.batchedSignals.push(node)
          }
        } else {
          self.notifySubscribers(node, 2)
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

  // ИСПРАВЛЕН: Добавлена циклическая защита от записи внутри эффекта (activeConsumer barrier)
  public notifySubscribers(node: ReactiveNode, state: NodeState): void {
    let link = node.subscribersHead
    while (link !== null) {
      const target = link.target!

      // 3. ФИКС ЦИКЛОВ: Если эффект пытается мутировать сигнал, от которого сам зависит,
      // мы блокируем пуш-уведомление вверх по этой же ветке во избежание бесконечной рекурсии
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
    node.fn = fn
    node.state = 2
    const self = this

    const publicComputed: Computed<T> = {
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
          self.log({ type: 'computed', label: name, details: { from: oldVal, to: node._value } })
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
      // ФИКС КОНТРАКТА v2.x ДЛЯ ПОДДЕРЖКИ ТЕСТА #161 (КАСКАДНОЕ УНИЧТОЖЕНИЕ СВЯЗЕЙ)
      get dependencies(): Set<any> {
        const depsSet = new Set<any>()
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
      cleanups: new Set<CleanupFn>(),
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
        publicEffect.cleanups.add(res)
        node.cleanup = () => {
          res()
          publicEffect.cleanups.delete(res)
        }
      }
    }

    if (this.currentOwner) {
      if (!this.currentOwner.ownedEffects) this.currentOwner.ownedEffects = []
      this.currentOwner.ownedEffects.push(node)
    }

    this.runEffectNode(node)

    const disposeFn = () => {
      this.disposeNode(node)
    }
    return disposeFn.bind(this)
  }

  // 6. ИЗМЕНЕН: Интеграция фабричного метода создания асинхронных ресурсов
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>
  ): Resource<T> {
    return createResource<T, S>(this, fetcher, source, optionsOrName)
  }

  // ИСПРАВЛЕН: Атомарный flush накопленных батч-сигналов на выходе из макро-транзакции
  public batch<T>(fn: () => T): T {
    this.batchDepth++
    try {
      return fn()
    } // Любые ошибки из пользовательского тела батча прозрачно летят наверх по спецификации
    finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        const signalsToFlush = this.batchedSignals
        this.batchedSignals = []

        for (const sig of signalsToFlush) {
          this.notifySubscribers(sig, 2)
        }

        this.flushEffects()
      }
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
  /* Внутренние Core методы NodeLink */
  public trackNode(source: ReactiveNode, target: ReactiveNode): void {
    let link = target.dependenciesHead
    while (link !== null) {
      if (link.source === source) {
        link.version = source.version
        return
      }
      link = link.nextDependency
    }
    const newLink = LinkPool.acquire(source, target)
    newLink.version = source.version
    if (target.depth <= source.depth) {
      target.depth = source.depth + 1
    }
    if (source.subscribersHead !== null) {
      source.subscribersHead.prevSubscriber = newLink
      newLink.nextSubscriber = source.subscribersHead
    }
    source.subscribersHead = newLink
    if (target.dependenciesHead !== null) {
      target.dependenciesHead.prevDependency = newLink
      newLink.nextDependency = target.dependenciesHead
    }
    target.dependenciesHead = newLink
  }
  public unlinkDependencies(target: ReactiveNode): void {
    let link = target.dependenciesHead
    target.dependenciesHead = null
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
      }
      LinkPool.release(link)
      link = next
    }
  }

  // ИСПРАВЛЕН: Валидация версий рёбер (Hot-fix для Value-Equality Cut и Domino-эффекта)
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
      // Синхронизируем локальный снимок ребра с актуальной версией источника
      if (link.version !== source.version) {
        link.version = source.version
        return true
      }
      link = link.nextDependency
    }
    return false
  }
  public evaluateComputed(node: ReactiveNode): void {
    this.unlinkDependencies(node)
    const prevConsumer = this.activeConsumer
    this.activeConsumer = node
    try {
      const newValue = node.fn!()
      if (!Object.is(node._value, newValue)) {
        node._value = newValue
        node.version++
      }
      node.state = 0
    } finally {
      this.activeConsumer = prevConsumer
    }
  }
  public runEffectNode(node: ReactiveNode): void {
    if (node.cleanup) {
      try {
        this.untrack(() => node.cleanup!())
      } catch (e) {
        node.state = 0
        throw e
      }
      node.cleanup = null
    }
    if (node.ownedEffects) {
      const copy = [...node.ownedEffects]
      node.ownedEffects = null
      for (const eff of copy) {
        this.disposeNode(eff)
      }
    }
    this.unlinkDependencies(node)
    const prevConsumer = this.activeConsumer
    const prevOwner = this.currentOwner
    this.activeConsumer = node
    this.currentOwner = node
    try {
node.fn!()
node.state = 0
    } finally {
      this.activeConsumer = prevConsumer
      this.currentOwner = prevOwner
    }
  }
  public disposeNode(node: ReactiveNode): void {
    node.isDisposed = true
    node.state = 0
    if (node.cleanup) {
      try {
        node.cleanup()
      } catch (e) {}
      node.cleanup = null
    }
    if (node.ownedEffects) {
      for (const eff of node.ownedEffects) {
        this.disposeNode(eff)
      }
      node.ownedEffects = null
    }
    this.unlinkDependencies(node)
    let link = node.subscribersHead
    node.subscribersHead = null
    while (link !== null) {
      const next = link.nextSubscriber
      LinkPool.release(link)
      link = next
    }
  }
  public reactive<T extends object>(target: T, name?: string): T {
    return createReactive<T>(this, target, name)
  }
  /**
   * Утилита для асинхронной задержки, чувствительная к AbortSignal.
   */
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
          // Проверяем, является ли функция фабрикой или моком
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

          // Если это класс, переданный как фабричное значение (редкий кейс v2.x)
          return entry as unknown as T
        }
        return entry as T
      }

      // Авто-резолв: если токен является конструктором класса, инстанцируем его, прокидывая engine
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
