import { useState as useStateFromReact, useEffect as useEffectFromReact } from 'react';
import { getExtractedValues } from './utils';

// --- ТИПЫ ---
export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;
export type Token<T> = string | symbol | { new(engine: ReactiveEngine, ...args: any[]): T };
export type Factory<T> = (engine: ReactiveEngine) => T;

export interface IEffect {
  run: () => void;
  label?: string;
  cleanups: Set<CleanupFn>;
}

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
 * Интерфейс для эффекта.
 * @interface IEffect
 */
export interface IEffect {
  /**
   * Запуск эффекта.
   * @function run
   * @returns {void}
   */
  run: () => void;

  /**
   * Коллекция функций очистки.
   * @type {Set<CleanupFn>}
   */
  cleanups: Set<CleanupFn>;
}

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

/**
 * Интерфейс для сигнала.
 * @template T
 * @interface Signal<T>
 */
export interface Signal<T> {
  /**
   * Значение сигнала.
   * @type {T}
   */
  value: T;

  /**
   * Подписка на изменение значения сигнала.
   * @function subscribe
   * @param {Function} cb - Коллбек функция для обработки изменения.
   * @returns {CleanupFn} - Функция для очистки подписки.
   */
  subscribe: (cb: (val: T) => void) => CleanupFn;
}

/**
 * Интерфейс для вычисляемого значения.
 * @template T
 * @interface Computed<T>
 */
export interface Computed<T> {
  /**
   * Только читаемое значение вычисляемого значения.
   * @type {T}
   */
  readonly value: T;

  /**
   * Подписка на изменение вычисляемого значения.
   * @function subscribe
   * @param {Function} cb - Коллбек функция для обработки изменения.
   * @returns {CleanupFn} - Функция для очистки подписки.
   */
  subscribe: (cb: (val: T) => void) => CleanupFn;

  /**
   * Принудительное уничтожение вычисляемого значения и его эффекта для предотвращения утечек памяти.
   */
  destroy: () => void;
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
 * Интерфейс для ресурса.
 * @template T
 * @interface Resource<T>
 */
export interface Resource<T> extends ResourceState<T> {
  /**
   * Перезагрузка ресурса.
   * @function refetch
   * @returns {void}
   */
  refetch: () => void;

  /**
   * Подписка на изменение состояния ресурса.
   * @function subscribe
   * @param {Function} cb - Коллбек функция для обработки изменения.
   * @returns {CleanupFn} - Функция для очистки подписки.
   */
  subscribe: (cb: (val: ResourceState<T>) => void) => CleanupFn;

  /**
   * Только читаемое состояние ресурса.
   * @type {ResourceState<T>}
   */
  readonly value: ResourceState<T>;
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

// --- ЯДРО ---
/**
 * Класс реактивного движка.
 */
export class ReactiveEngine {
  private activeEffect: IEffect | null = null;
  private isBatching = false;
  private pendingEffects = new Set<IEffect>();

  // В контейнерах DI вместо any используем unknown. Это заставит методы inject/provide
  // явно приводить типы через дженерики <T>, защищая от рантайм-ошибок.
  private services = new Map<Token<unknown>, unknown>();
  private factories = new Map<Token<unknown>, Factory<unknown>>();

  // Объект-ключ мапится на объект-прокси. Здесь идеально подходит тип object.
  private proxyCache = new WeakMap<object, object>();
  private allEffects = new Set<IEffect>();

  /**
   * Коллбек для уведомления об изменении сигнала.
   * Использование unknown вместо any гарантирует безопасную работу с типами prev/next.
   */
  public onSignalChange?: (name: string, next: unknown, prev: unknown) => void;

  // Описываем строгие типы для адаптеров React, чтобы не ломать встроенные типы React.
  private reactAdapters: {
    useState: typeof useStateFromReact;
    useEffect: typeof useEffectFromReact;
  } = {
      useState: useStateFromReact,
      useEffect: useEffectFromReact,
    };

  /**
   * DI: Регистрация зависимости.
   * @template T
   * @function provide
   * @param {Token<T>} token - Токен для зависимости.
   * @param {T | Factory<T>} valueOrFactory - Значение или фабрика для создания сервиса.
   * @returns {void}
   * @source
   */
  public provide<T>(token: Token<T>, valueOrFactory: T | Factory<T>): void {
    if (typeof valueOrFactory === 'function' && !valueOrFactory.prototype) {
      this.factories.set(token, valueOrFactory as Factory<T>);
    } else {
      this.services.set(token, valueOrFactory);
    }
  }

  /**
   * DI: Инъекция; Получение сервиса по токену.
   * @template T
   * @function inject
   * @param {Token<T>} token - Токен для зависимости.
   * @returns {T} - Сервис.
   * @source
   */
  public inject<T>(token: Token<T>): T {
    if (!token) {
      throw new Error(`[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.`);
    }

    // Приводим токен к базовому типу Token<unknown> для совместимости с Map
    const targetToken = token as Token<unknown>;

    if (this.services.has(targetToken)) {
      return this.services.get(targetToken) as T;
    }

    try {
      const factory = this.factories.get(targetToken);
      if (factory) {
        const instance = factory(this) as T;
        this.services.set(targetToken, instance);
        return instance;
      }
      if (typeof token === 'function' && token.prototype) {
        const instance = new (token as { new(eng: ReactiveEngine): T })(this);
        this.services.set(targetToken, instance);
        return instance;
      }
      throw new Error(`Service not found: ${String(token)}`);
    } catch (e) {
      throw new Error(`[DI Error]: Не удалось создать сервис ${String(token)}. Ошибка: ${(e as Error)?.message || 'No e?.message'}`);
    }
  }

  /**
   * Создание сигнала.
   * @template T
   * @function signal
   * @param {T} initialValue - Начальное значение сигнала.
   * @param {string | SignalOptions<T>} [optionsOrName] - Имя или опции сигнала.
   * @returns {Signal<T>} - Сигнал.
   * @source
   */
  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const engine = this;
    let val = initialValue;
    const subscribers = new Set<IEffect>();
    const options = typeof optionsOrName === 'string'
      ? { name: optionsOrName }
      : optionsOrName || {};
    const name = options.name || 'unnamed_signal';

    return {
      get value(): T {
        if (engine.activeEffect) subscribers.add(engine.activeEffect);
        return val;
      },
      set value(newValue: T) {
        if (val === newValue) return;

        // ВАЛИДАЦИЯ В RUNTIME
        if (options.validate) {
          const result = options.validate(newValue);
          if (result === false || typeof result === 'string') {
            const errorMsg = typeof result === 'string'
              ? result
              : `[Validation Error]: Некорректное значение для сигнала "${name}"`;

            console.error(`%c${errorMsg}`, "color: orange; font-weight: bold;", {
              received: newValue,
              current: val
            });
            return; // Прерываем обновление, если данные не валидны
          }
        }

        const old = val;
        val = newValue;
        engine.onSignalChange?.(name, newValue, old);

        // 1. Всегда добавляем подписчиков в очередь отложенных эффектов
        subscribers.forEach(e => engine.pendingEffects.add(e));

        // 2. Если очередь еще не запущена, планируем её автоматическое выполнение в микрозадачу
        if (!engine.isBatching) {
          engine.isBatching = true;

          queueMicrotask(() => {
            const effects = Array.from(engine.pendingEffects);
            engine.pendingEffects.clear();
            engine.isBatching = false;

            // Запускаем все накопившиеся эффекты и ререндеры за один раз
            effects.forEach(e => e.run());
          });
        }
      },
      subscribe(cb) {
        // Чистая и безопасная подписка для React:
        // Мы вызываем cb, но НЕ передаем туда аргументы, чтобы не ломать useSyncExternalStore
        return engine.effect(() => {
          cb(this.value);
        });
      }
    };
  }

  /**
   * Создание эффекта.
   * @function effect
   * @param {EffectFn} fn - Функция эффекта.
   * @param {string} [label] - Необязательная метка для логирования и отладки.
   * @returns {CleanupFn} - Функция для очистки эффекта.
   * @source
   */
  public effect(fn: EffectFn, label?: string): CleanupFn {
    const engine = this;
    const effectObj: IEffect = {
      label, // Запоминаем имя эффекта для профайлера/логов
      cleanups: new Set(),
      run() {
        this.cleanups.forEach(c => c());
        this.cleanups.clear();
        const prev = engine.activeEffect;
        engine.activeEffect = this;
        engine.safeRun(this, () => {
          const cleanup = fn();
          if (typeof cleanup === 'function') this.cleanups.add(cleanup);
        });
        engine.activeEffect = prev;
      }
    };
    this.allEffects.add(effectObj);
    effectObj.run();

    return () => {
      effectObj.cleanups.forEach(c => c());
      engine.pendingEffects.delete(effectObj);
      engine.allEffects.delete(effectObj); // Всегда чистим за собой
    };
  }

  // Кэш для вычисляемых свойств: Вместо Map<Function, any> используем строгий интерфейс с unknown дженериком
  private computedCache = new Map<Function, WeakRef<Computed<unknown>>>();

  // 1. Создаем реестр финализации под капотом движка.
  // В качестве токена очистки передаем функцию, которую нужно выполнить.
  private cleanupRegistry = new FinalizationRegistry<() => void>(
    (cleanupFn) => {
      cleanupFn(); // Вызовется автоматически, когда сборщик мусора удалит computedInstance
    }
  );

  /**
   * Создание вычисляемого значения.
   * @template T
   * @function computed
   * @param {Function} fn - Функция для вычисления значения.
   * @param {string} [signalName] - Имя сигнала.
   * @returns {Computed<T>} - Вычисляемое значение с методом destroy.
   * @source
   */
  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    // 1. Проверяем кэш. Если WeakRef существует и объект внутри него еще не удален GC:
    if (this.computedCache.has(fn)) {
      const cachedRef = this.computedCache.get(fn);
      const cachedInstance = cachedRef?.deref();
      if (cachedInstance) {
        return cachedInstance as Computed<T>;
      }
    }

    const engine = this;
    const sig = this.signal<T>(undefined as unknown as T, signalName || 'unnamed_computed');

    const unsubscribeEffect = this.effect(() => {
      const newValue = fn();
      sig.value = newValue;
    });

    const effectObj = Array.from(this.allEffects)[this.allEffects.size - 1];

    const performCleanup = () => {
      unsubscribeEffect();
      if (effectObj) {
        engine.allEffects.delete(effectObj);
      }
      engine.computedCache.delete(fn);
    };

    // Создаем инстанс computed
    const computedInstance: Computed<T> = {
      get value() { return sig.value; },
      subscribe: (cb) => sig.subscribe(cb),
      destroy() {
        performCleanup();
      }
    };

    this.cleanupRegistry.register(computedInstance, performCleanup);

    // 2. Сохраняем в кэш СЛАБУЮ ССЫЛКУ (WeakRef) на наш объект.
    // Теперь этот кэш больше НЕ будет удерживать объект в памяти насильно!
    this.computedCache.set(fn, new WeakRef(computedInstance as Computed<unknown>));

    return computedInstance;
  }

  /**
   * Создание реактивного объекта (Proxy).
   * @template T
   * @function reactive
   * @param {T} target - Целевой объект для проксирования.
   * @param {string} [name] - Имя проксируемого объекта.
   * @returns {T} - Реактивный объект.
   * @source
   */
  public reactive<T extends object>(target: T, name: string = 'reactive'): T {
    if (this.proxyCache.has(target)) {
      return this.proxyCache.get(target) as T;
    }
    const engine = this;
    const propsSubscribers = new Map<string | symbol, Set<IEffect>>();

    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        if (engine.activeEffect) {
          if (!propsSubscribers.has(prop)) propsSubscribers.set(prop, new Set());
          propsSubscribers.get(prop)!.add(engine.activeEffect);
        }
        const value = Reflect.get(obj, prop, receiver);
        return (value !== null && typeof value === 'object')
          ? engine.reactive(value, `${name}.${String(prop)}`)
          : value;
      },
      set(obj, prop, value, receiver) {
        const old = Reflect.get(obj, prop, receiver);
        // ПРОВЕРКА НА ИДЕНТИЧНОСТЬ
        if (old === value) return true;

        if (old !== value) {
          Reflect.set(obj, prop, value, receiver);
          engine.onSignalChange?.(`${name}.${String(prop)}`, value, old);
          propsSubscribers.get(prop)?.forEach(e =>
            engine.isBatching ? engine.pendingEffects.add(e) : e.run()
          );
        }
        return true;
      }
    });
    this.proxyCache.set(target, proxy);
    return proxy;
  }

  /**
   * Группировка изменений. (Оставил для обратной совместимости)
   * @function batch
   * @param {Function} fn - Функция для выполнения в группе.
   * @returns {void}
   * @source
   */
  public batch(fn: () => void): void {
    // Наш асинхронный сеттер теперь сам выполняет всю работу в queueMicrotask,
    // поэтому здесь мы можем просто выполнить функцию
    fn();
  }

  /**
   * Вспомогательная функция для задержки (sleep), чувствительная к AbortSignal
   *
   * Вызов new DOMException('Aborted', 'AbortError') гарантирует,
   * что ваша кастомная пауза между ретраями this.delay притворяется для движка JavaScript
   * точно таким же нативным процессом отмены, как и fetch().
   * Это делает реактивное ядро бесшовным и избавляет от необходимости
   * писать кучу разных проверок под каждый тип ошибки.
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }

      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeoutId); // СИНХРОННО УБИВАЕТ ТАЙМЕР. В Vitest это заставит таймер исчезнуть из очереди прокрутки
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Создание асинхронного ресурса. Типы на входе: <T - формат ответа, S - источник изменений (сигнал либо computed-кортеж из зачений сигналов через конструкцию `.value`)>
   *
   * Explained 👉 {@link https://github.com/garage-13/reactive-engine/blob/main/README_EN.md#1-async-resources-dependent-on-multiple-signals}
   *
   * @template T, S
   * @see {@link https://github.com/garage-13/reactive-engine/blob/main/src/examples/20-resource/Example20.tsx Реализация базового компонента Example20}
   * @see {@link https://github.com/garage-13/reactive-engine/blob/main/src/examples/21-multi-resource/service.secondary.ts Сложный пример зависимости ресурсов через computed}
   * @function resource
   * @param {Function} fetcher - Асинхронная функция для загрузки данных.
   * @param {{ value: S }} [source] - Источник данных.
   * @param {string | ResourceOptions<T>} [optionsOrName] - Имя сигнала или объект конфигурации `{ name: string; validate: (res) => boolean | string; resetDataOnSourceChange?: boolean }`.
   * @returns {Resource<T>} - Асинхронный ресурс.
   *
   * @example
   * // Базовый вызов со строкой (обратная совместимость):
   * const res = engine.resource(fetcher, source, 'my-resource-name');
   *
   * @example
   * // Современный вызов с валидацией ответа:
   * const res = engine.resource(fetcher, source, {
   *   name: 'my-resource-name',
   *   resetDataOnSourceChange: true, // true by default
   *   responseValidate: (data) => !!data || 'Данные пусты', // Проверяйте формат в соотв. с дженериком
   * });
   *
   * @example
   * // (Экспериментальная фича)
   * // В теле fetcher можно выкинуть ошибку в виде
   * // `throw new Error('[THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY=1][MESSAGE=Your msg]')`
   * // Причина: Особенности внутренней реализации определения харакрера ошибки и необходимость делать retry (если такая опция передана)
   * // Рекомендуем вместо этого использовать `validateBeforeFetch` в опциях при создании ресурса.
   * const res = engine.resource(
   *   async (counterValue, abortSignal) => {
   *     if (counterValue === 0)
   *       throw new Error([
   *         '[THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY=1]', // Иначе запустится механизм retry (напр. по причине отсутствия сети, далее в этом же примере)
   *         `[MESSAGE=Stop for count value ${counterValue} - excepted from fetcher fn body]`,
   *       ].join(' '))
   *     const res = await fetch(
   *       [
   *         `${BASE_API_URL}/profile/search`,
   *         '?',
   *         [
   *           `counter=${counterValue}`,
   *           '_responseDelay=2000',
   *         ].join('&')
   *       ].join(''),
   *       { signal: abortSignal }
   *     )
   *     if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
   *     return res.json()
   *   },
   *   this.counter,
   * )
   * @source
   */
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>,
  ): Resource<T> {
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object';
    const signalName = isOptionsObject
      ? (optionsOrName as ResourceOptions<T, S>).name
      : (optionsOrName as string) || 'unnamed_resource';

    const options: Partial<ResourceOptions<T, S>> = isOptionsObject
      ? (optionsOrName as ResourceOptions<T, S>)
      : {};

    const resetDataOnSourceChange = options.resetDataOnSourceChange ?? true;
    const responseValidate = options.responseValidate;
    const validateBeforeFetch = options.validateBeforeFetch;

    const retryCount = options.retryCount ?? 0;
    const baseDelay = options.retryDelay ?? 1000;
    const useExponential = options.isExponentialBackoffEnabled ?? false;
    const maxRetryDelay = options.maxRetryDelay ?? 30000;
    const timeoutMs = options.timeout;

    const state = this.signal<ResourceState<T>>(
      { data: null, loading: true, error: null, isRetrying: false },
      signalName
    );

    const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
      if (effectSignal.aborted) return;

      if (validateBeforeFetch) {
        const preValidationResult = validateBeforeFetch(sValue);
        if (preValidationResult === false || typeof preValidationResult === 'string') {
          if (effectSignal.aborted) return;
          const errorMsg = typeof preValidationResult === 'string'
            ? preValidationResult
            : 'Pre-fetch validation failed for resource';

          // При ручном refetch (не смена source) сохраняем старые данные, а не зануляем
          const currentData = isSourceChange ? null : this.untrack(() => state.value.data);
          state.value = { data: currentData, loading: false, error: new Error(errorMsg), isRetrying: false };
          return;
        }
      }

      const shouldClear = isSourceChange && resetDataOnSourceChange;
      const currentData = shouldClear ? null : this.untrack(() => state.value.data);

      state.value = { data: currentData, loading: true, error: null, isRetrying: false };

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        if (effectSignal.aborted) return;
        let combinedSignal = effectSignal;

        try {
          if (timeoutMs && timeoutMs > 0) {
            const timeoutSignal = AbortSignal.timeout(timeoutMs);
            combinedSignal = AbortSignal.any([effectSignal, timeoutSignal]);
          }

          const data = await fetcher(sValue, combinedSignal);

          if (effectSignal.aborted) return;

          if (combinedSignal.aborted) {
            throw new DOMException('The operation timed out.', 'TimeoutError');
          }

          if (responseValidate) {
            const validationResult = responseValidate(data);
            if (validationResult === false || typeof validationResult === 'string') {
              if (effectSignal.aborted) return;
              const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed';
              state.value = { data: null, loading: false, error: new Error(errorMsg), isRetrying: false };
              return;
            }
          }

          if (effectSignal.aborted) return;

          state.value = { data, loading: false, error: null, isRetrying: false };
          return;
        } catch (e: any) {
          // ЖЕСТКИЙ ВЫХОД: Если внешняя область (эффект или новый refetch) сделала abort,
          // мы НЕМЕДЛЕННО прекращаем выполнение и ничего не пишем в стейт.
          if (effectSignal.aborted || (e.name === 'AbortError' && effectSignal.aborted)) return;

          const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError' || e.message?.includes('timeout');

          const isCustomValidationError = getExtractedValues({
            tested: [e.message], expectedKey: 'THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY', valueType: 'number',
          })?.[0] === '1' || false

          const __defaultCustomValidationErrorMessage = 'Custom validation error';
          let customValidationErrorMessage: string = isCustomValidationError
            ? (getExtractedValues({
              tested: [e.message], expectedKey: 'MESSAGE', valueType: 'string',
            })?.[0] || __defaultCustomValidationErrorMessage)
            : __defaultCustomValidationErrorMessage;

          const isFetchBodyValidationError = isCustomValidationError || e.name === 'ValidationError';

          if (attempt === retryCount || isFetchBodyValidationError) {
            if (effectSignal.aborted) return;

            const finalError = isTimeout
              ? new Error(`Request timed out after ${timeoutMs}ms`, { cause: e })
              : isCustomValidationError
                ? new Error(customValidationErrorMessage, { cause: e })
                : e;

            state.value = { data: null, loading: false, error: finalError, isRetrying: false };
            return;
          } else {
            if (effectSignal.aborted) return;

            let currentDelay = useExponential ? baseDelay * Math.pow(2, attempt) : baseDelay;
            currentDelay = Math.min(currentDelay, maxRetryDelay);
            const jitter = Math.random() * 200;
            currentDelay = currentDelay + jitter;

            // Безопасно обновляем статус ретрая, только если сигнал живой
            state.value = { data: state.value.data, loading: true, error: null, isRetrying: true };

            const logReason = isTimeout ? 'таймауту' : 'ошибке сети';
            console.warn(`[Resource Retry] "${signalName}" сбой по ${logReason}. Попытка ${attempt + 1}/${retryCount + 1}...`);

            try {
              await this.delay(currentDelay, effectSignal);
              if (effectSignal.aborted) return;
            } catch (delayError) {
              return;
            }
          }
        }
      }
    };

    let activeEffectController: AbortController | null = null;

    this.effect(() => {
      const sValue = source ? source.value : undefined as S;
      const effectController = new AbortController();
      activeEffectController = effectController;

      this.untrack(() => {
        load(sValue as S, effectController.signal, true);
      });

      return () => effectController.abort();
    });

    return {
      get data() { return state.value.data; },
      get loading() { return state.value.loading; },
      get error() { return state.value.error; },
      get isRetrying() { return state.value.isRetrying; },
      get value() { return state.value; },
      refetch: () => {
        activeEffectController?.abort();
        activeEffectController = new AbortController();
        load(source ? source.value : undefined as S, activeEffectController.signal, false);
      },
      subscribe: (cb) => state.subscribe(cb)
    };
  }

  /**
   * Выполняет функцию без отслеживания зависимостей.
   * @template T
   * @function untrack
   * @param {Function} fn - Функция для выполнения.
   * @returns {T} - Результат выполнения функции.
   * @source
   */
  public untrack<T>(fn: () => T): T {
    const prev = this.activeEffect;
    this.activeEffect = null; // Временно "забываем" про активный эффект
    try {
      return fn();
    } finally {
      this.activeEffect = prev; // Возвращаем эффект на место
    }
  }

  /**
   * Установка адаптеров React.
   * @function setReactAdapters
   * @param {Function} useState - Функция useState из React.
   * @param {Function} useEffect - Функция useEffect из React.
   * @returns {void}
   * @source
   */
  // Импортируйте useState и useEffect на верхнем уровне файла из 'react'
  public setReactAdapters(
    useState: typeof useStateFromReact,
    useEffect: typeof useEffectFromReact
  ): void {
    this.reactAdapters = { useState, useEffect };
  }

  /**
   * Использование реактивного значения в React компоненте.
   * @template T
   * @function use
   * @param {{ value: T; subscribe: (cb: (v: T) => void) => CleanupFn }} item - Реактивный объект.
   * @returns {T} - Значение реактивного объекта.
   * @source
   */
  public use<T>(item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn }): T {
    if (!this.reactAdapters) {
      throw new Error("[React Error]: Адаптеры React не установлены. Вызовите engine.setReactAdapters(useState, useEffect).");
    }

    // NOTE: (защита) проверяем, что нам передали объект сигнала
    if (!item || typeof item.subscribe !== 'function') {
      const errorMsg = `
        [Reactive Error]: engine.use() получил некорректный объект!
        Скорее всего, вы пытаетесь подписаться на свойство сервиса, которое не было инициализировано.
        Проверьте, что в классе написано: public mySignal = this.engine.signal(...)
      `;
      console.error(errorMsg, { item });
      throw new Error(errorMsg);
    }
    const [val, setVal] = this.reactAdapters.useState(item.value);

    this.reactAdapters.useEffect(
      () => {
        return item.subscribe(setVal);
      },
      [item]
    );

    return val;
  }

  /**
   * Безопасное выполнение функции.
   * @private
   * @function safeRun
   * @param {IEffect} effect - Эффект.
   * @param {Function} fn - Функция для выполнения.
   * @returns {void}
   * @source
   */
  private safeRun(effect: IEffect, fn: () => void) {
    try {
      fn();
    } catch (error) {
      console.error(
        `%c[Reactive Error] %cОшибка в эффекте/computed:`,
        "color: white; background: red; padding: 2px 4px; border-radius: 3px;",
        "font-weight: bold;",
        error
      );
      // Здесь можно отправить ошибку в Sentry или другой сервис мониторинга
    }
  }
}
