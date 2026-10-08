import type { ReactiveEngine } from './core'

export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;
export type Token<T> = string | symbol | { new(engine: ReactiveEngine, ...args: any[]): T };
export type Factory<T> = (engine: ReactiveEngine) => T;

/**
 * Интерфейс атомарного Сигнала графа.
 */
export interface Signal<T> {
  value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn;
}

/**
 * Интерфейс синхронно-ленивого Вычисляемого свойства.
 */
export interface Computed<T> {
  readonly value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn;
  destroy: () => void;
}

/**
 * Интерфейс побочного Эффекта планировщика.
 */
export interface IEffect {
  id: number;
  run: () => void;
  markDirty: () => void;
  cleanups: Set<CleanupFn>;
  label?: string;
}

/**
 * Опции конфигурации Сигналов.
 */
export interface SignalOptions<T> {
  name?: string;
  validate?: (value: T) => boolean | string;
}

/**
 * Состояние асинхронного ресурса.
 */
export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isRetrying?: boolean;
}

/**
 * Контракт асинхронного Ресурса ядра.
 */
export interface Resource<T> extends ResourceState<T> {
  refetch: () => void;
  subscribe: (cb: (val: ResourceState<T>) => void) => CleanupFn;
  readonly value: ResourceState<T>;
}

/**
 * Настройки конфигурации асинхронного Ресурса.
 * Полностью очищены от legacy-параметров ретраев и таймаутов.
 */
export interface ResourceOptions<T, S = void> {
  /** Уникальное имя ресурса для трассировки и логирования */
  name?: string;
  /** Принудительный сброс данных в null при изменении источника (true по умолчанию) */
  resetDataOnSourceChange?: boolean;
  /** Декларативная пре-валидация параметров ДО отправки запроса в сеть */
  validateBeforeFetch?: (source: S) => boolean | string;
  /** Валидация структуры ответа сервера после успешного разрешения промиса */
  responseValidate?: (data: T) => boolean | string;
}

/**
 * Параметры продвинутой системы логирования транзакций.
 */
export interface EngineLoggerOptions {
  instanceName?: string;
  isEnabled: boolean;
  traceTime?: boolean;
  filter?: RegExp | string;
  isCoreOptimizationDebugEnabled?: boolean;
}

// Детализированные Payload-структуры для логов
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

/**
 * Карта маппинга категорий логов для безопасной работы метода queueLog.
 */
export interface LogDetailMap {
  signal: SignalLogDetail;
  computed: ComputedLogDetail;
  effect: EffectLogDetail;
  batch: BatchLogDetail;
  resource: ResourceLogDetail;
  reactive: ReactiveDetail;
}
