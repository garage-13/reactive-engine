import type { ReactiveEngineCore } from './core'

export type LogEventType = 'signal' | 'computed' | 'effect' | 'batch' | 'resource' | 'reactive';

export interface LogRecord {
  type: LogEventType;
  label: string;
  from?: unknown;
  to?: unknown;
  payload?: unknown;
  timestamp: number;
}

export interface TransactionContext {
  id: string;
  pendingLogQueue: LogRecord[];
  isFlushing: boolean;
}

export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;
export type Token<T> = string | symbol | { new(engine: ReactiveEngineCore, ...args: any[]): T };
export type Factory<T> = (engine: ReactiveEngineCore) => T;

/**
 * ⚛️ БАЗОВЫЙ ИНТЕРФЕЙС-КОНТРАКТ ДЛЯ ЛЮБЫХ СИГНАЛОПОДОБНЫХ УЗЛОВ
 */
export interface ISignalLike<V> {
  /**
   * Публичный геттер с автоматическим динамическим трекингом зависимостей графа
   */
  readonly value: V;

  /**
   * Безопасное чтение значения из кэша БЕЗ трекинга зависимостей.
   */
  valueWithoutTracking?: V;

  /**
   * Активная Push-подписка на каждое изменение значения узла
   */
  subscribe: (cb: (v: V) => void) => CleanupFn;

  /**
   * Пассивный системный хук подписки на завершение реактивной транзакции.
   */
  __subscribe?: (cb: () => void) => CleanupFn;
}

/**
 * Интерфейс атомарного Сигнала графа.
 * ⚛️ ТЕПЕРЬ ЯВНО НАСЛЕДУЕТ ISignalLike<T> ДЛЯ ГАРАНТИРОВАННОГО ВЫВОДА ТИПОВ
 */
export interface Signal<T> extends ISignalLike<T> {
  value: T;
  destroy: () => void;
}

/**
 * Интерфейс синхронно-ленивого Вычисляемого свойства.
 * ⚛️ ТЕПЕРЬ ЯВНО НАСЛЕДУЕТ ISignalLike<T> ДЛЯ КЭШИРОВАНИЯ И ВЫВОДА ТИПОВ
 */
export interface Computed<T> extends ISignalLike<T> {
  readonly value: T;
  destroy: () => void;
  _isDirty?: () => boolean;
  dependencies?: Set<any>;
  run?: () => void;
  type?: any;
}

export interface IEffect {
  id: number;
  run: () => void;
  markDirty: () => void;
  cleanups: Set<CleanupFn>;
  label?: string;
  isDirty?: boolean;
  isDisposed?: boolean;
  execute?: () => void;
  fn?: () => void;
  _node?: any;
}

export interface SignalOptions<T> {
  name?: string;
  validate?: (value: T) => boolean | string;
}

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isRetrying?: boolean;
}

export interface Resource<T> extends ResourceState<T> {
  refetch: () => void;
  subscribe: (cb: (val: ResourceState<T>) => void) => CleanupFn;
  readonly value: ResourceState<T>;
  destroy: () => void;
}

export interface ResourceOptions<T, S = void> {
  name?: string;
  resetDataOnSourceChange?: boolean;
  validateBeforeFetch?: (source: S) => boolean | string;
  responseValidate?: (data: T) => boolean | string;
}

export interface EngineLoggerOptions {
  instanceName?: string;
  isEnabled: boolean;
  traceTime?: boolean;
  filter?: RegExp | string;
  isCoreOptimizationDebugEnabled?: boolean;
}

export interface SignalLogDetail {
  from: unknown;
  to: unknown;
  subscribersCount: number;
  subscribers: string[];
}

export interface ComputedLogDetail {
  value: unknown;
  duration: string;
}

export interface EffectLogDetail {
  triggeredBy: string;
  executionTime?: string;
}

export interface BatchLogDetail {
  transactionSize: number;
  totalEffectsRun: number;
}

export interface ResourceLogDetail {
  loading: boolean;
  data: unknown;
  error: Error | null;
  isRetrying?: boolean;
}

export interface ReactiveDetail {
  action: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface LogDetailMap {
  signal: SignalLogDetail;
  computed: ComputedLogDetail;
  effect: EffectLogDetail;
  batch: BatchLogDetail;
  resource: ResourceLogDetail;
  reactive: ReactiveDetail;
}
