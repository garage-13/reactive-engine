

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: any | null;
}

/**
 * Функция для очистки эффекта.
 * @typedef {() => void} CleanupFn
 */

/**
 * Функция эффекта, которая может возвращать функцию очистки.
 * @typedef {() => CleanupFn | void} EffectFn
 */

/**
 * Токен для зависимости.
 * @typedef {string | symbol | { new(engine: ReactiveEngine, ...args: any[]): T }} Token<T>
 */

/**
 * Фабрика для создания сервиса.
 * @template T
 * @typedef {(engine: ReactiveEngine) => T} Factory<T>
 */

/**
 * Интерфейс для состояния ресурса.
 * @template T Data format
 * @interface ResourceState<T>
 */
export interface ResourceState<T> {
  /**
   * Данные ресурса.
   * @type {T | null}
   */
  data: T | null;

  /**
   * Состояние загрузки ресурса.
   * @type {boolean}
   */
  loading: boolean;

  /**
   * Ошибка ресурса.
   * @type {any | null}
   */
  error: any | null;

  /** Флаг активного процесса повторных попыток после сбоя сети */
  isRetrying: boolean;
}

export interface ResourceOptions<T, S> {
  name: string;
  /** Автоматически сбрасывать data в null при изменении source. По умолчанию: true */
  resetDataOnSourceChange?: boolean;
  /** Функция для валидации успешного ответа сервера перед его сохранением в стейт.
   *
   * Варианты возвращаемого значения:
   * - true 👉 все ок
   * - false 👉 в error попадет стандартный текст ошибки
   * - string 👉 попадет в поле error
   * */
  responseValidate?: (responseData: T) => boolean | string;
  /** Функция валидации входных зависимостей (source) перед запуском fetch.
   * Если возвращает false или string (текст ошибки) — запрос и ретраи блокируются. */
  validateBeforeFetch?: (sourceValue: S) => boolean | string;
  /** Настройка лимита повторов retry. */
  retryCount?: number;
  /** Настройка задержки первого повтора retry. */
  retryDelay?: number;
  /** Включить экспоненциальное увеличение задержки (каждая попытка ждет в 2 раза дольше). По умолчанию: false */
  isExponentialBackoffEnabled?: boolean;
  /** Максимальный лимит ожидания между попытками в миллисекундах. По умолчанию: 30000 (30 секунд) */
  maxRetryDelay?: number;
  /** Максимальное время ожидания ответа сервера в миллисекундах. По умолчанию: отсутствует (бесконечно) */
  timeout?: number;
}

/**
 * Интерфейс для опций сигнала.
 * @template T
 * @interface SignalOptions<T>
 */
export interface SignalOptions<T> {
  /**
   * Имя сигнала.
   * @type {string}
   */
  name?: string;

  /**
   * Валидатор значения сигнала.
   * @function validate
   * @param {T} val - Значение для валидации.
   * @returns {boolean | string} - Результат валидации.
   */
  validate?: (val: T) => boolean | string;
}
