import { Signal, Computed, IEffect, EngineLoggerOptions, LogEventType } from './types'

export class ReactiveEngineCore {
  private logger: EngineLoggerOptions
  public epoch = 0
  public activeConsumer: IEffect | null = null
  public batchDepth = 0
  public subscriberId = 0
  public pendingEffects = new Set<IEffect>()
  public computedCache = new Map<Function, WeakRef<Computed<unknown>>>()
  private _batchStartValues = new Map<unknown, unknown>()
  private _stableValuesSnapshot = new Map<unknown, unknown>()

  constructor(options?: { logger?: EngineLoggerOptions }) {
    this.logger = options?.logger || { isEnabled: false }
  }

  private shouldLog(type: LogEventType): boolean {
    if (!this.logger.isEnabled) return false
    const filter = this.logger.filter
    return typeof filter === 'string' ? (filter === '' || type.toLowerCase() === filter.toLowerCase()) : filter instanceof RegExp ? filter.test(type) : true
  }

  public flushEffects(): void {}
  public batch<R>(fn: () => R): R { return fn() }
  public signal<T>(initialValue: T, optionsOrName?: string | any): Signal<T> { return {} as any }
  public computed<T>(fn: () => T, signalName?: string): Computed<T> { return {} as any }
  public effect(fn: any, effectName?: string): () => void { return () => {} }
  public untrack<R>(fn: () => R): R { return fn() }
  public reactive<T extends object>(target: T, name?: string): T { return target }
  public provide(token: any, valueOrFactory: any): void {}
  public inject<T = any>(token: any): T { return undefined as any }
  public resource<T, S>(fetcher: any, source: any): any { return {} as any }
}
