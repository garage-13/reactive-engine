import { useState as useStateFromReact, useEffect as useEffectFromReact } from 'react';

// --- ТИПЫ ---
export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;
export type Token<T> = string | symbol | { new(engine: ReactiveEngine, ...args: any[]): T };
export type Factory<T> = (engine: ReactiveEngine) => T;

export interface IEffect {
  run: () => void;
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
   * @returns {CleanupFn} - Функция для очистки эффекта.
   * @source
   */
  public effect(fn: EffectFn): CleanupFn {
    const engine = this;
    const effectObj: IEffect = {
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
   * Создание асинхронного ресурса.
   * @template T
   * @function resource
   * @param {Function} fetcher - Функция для загрузки данных.
   * @param {{ value: S }} [source] - Источник данных.
   * @param {string} [signalName] - Имя сигнала ресурса.
   * @returns {Resource<T>} - Асинхронный ресурс.
   * @source
   */
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    signalName?: string,
  ): Resource<T> {
    const state = this.signal<ResourceState<T>>({ data: null, loading: true, error: null }, signalName || 'unnamed_resource');
    let controller: AbortController | null = null;

    const load = async (sValue: S) => {
      controller?.abort();
      controller = new AbortController();

      // Читаем текущие данные без создания зависимости!
      const currentData = this.untrack(() => state.value.data);

      // Теперь обновление состояния не вызовет перезапуск эффекта
      state.value = { data: currentData, loading: true, error: null };

      try {
        const data = await fetcher(sValue, controller.signal);
        if (!controller.signal.aborted) {
          state.value = { data, loading: false, error: null };
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          state.value = { data: null, loading: false, error: e };
        }
      }
    };

    // Чтобы эффект не подписывался на state,
    // нам нужно изолировать чтение source от чтения state
    this.effect(() => {
      // Читаем ТОЛЬКО source. Это наша единственная зависимость.
      const sValue = source ? source.value : undefined as S;

      // Вызываем load. Внутри load чтение state.value
      // не должно регистрироваться как зависимость этого эффекта.
      load(sValue);

      return () => controller?.abort();
    });

    return {
      get data() { return state.value.data; },
      get loading() { return state.value.loading; },
      get error() { return state.value.error; },
      get value() { return state.value; },
      refetch: () => load(source ? source.value : undefined as S),
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
