import { useState, useEffect } from 'react';

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
 * @template T
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
  private services = new Map<Token<any>, any>();
  private factories = new Map<Token<any>, Factory<any>>();
  private proxyCache = new WeakMap<object, any>();
  private allEffects = new Set<IEffect>();

  /**
   * Коллбек для уведомления о изменении сигнала.
   * @type {Function}
   */
  public onSignalChange?: (name: string, next: any, prev: any) => void;

  private reactAdapters = {
    useState: useState as any,
    useEffect: useEffect as any,
  };

  /**
   * DI: Регистрация зависимости.
   * @template T
   * @function provide
   * @param {Token<T>} token - Токен для зависимости.
   * @param {T | Factory<T>} valueOrFactory - Значение или фабрика для создания сервиса.
   * @returns {void}
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
   */
  public inject<T>(token: Token<T>): T {
    if (!token) {
      throw new Error(`[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.`);
    }

    if (this.services.has(token)) return this.services.get(token);

    // NOTE: (new way) Если это класс, но мы забыли его унаследовать от BaseService или передать engine
    try {
      // NOTE: Логика создания инстанса
      const factory = this.factories.get(token);
      if (factory) {
        const instance = factory(this);
        this.services.set(token, instance);
        return instance;
      }
      if (typeof token === 'function' && token.prototype) {
        const instance = new (token as { new(eng: ReactiveEngine): T })(this);
        this.services.set(token, instance);
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
   */
  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const engine = this;
    let val = initialValue;
    const subscribers = new Set<IEffect>();

    // Парсим аргументы для обратной совместимости
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
        subscribers.forEach(e =>
          engine.isBatching ? engine.pendingEffects.add(e) : e.run()
        );
      },
      subscribe(cb) {
        return engine.effect(() => cb(this.value));
      }
    };
  }

  /**
   * Создание эффекта.
   * @function effect
   * @param {EffectFn} fn - Функция эффекта.
   * @returns {CleanupFn} - Функция для очистки эффекта.
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
    this.allEffects.add(effectObj); // Регистрируем эффект в глобальном списке
    effectObj.run();
    return () => {
      effectObj.cleanups.forEach(c => c());
      engine.pendingEffects.delete(effectObj);
    };
  }

  /**
   * Создание вычисляемого значения.
   * @template T
   * @function computed
   * @param {Function} fn - Функция для вычисления значения.
   * @param {string} [signalName] - Имя сигнала.
   * @returns {Computed<T>} - Вычисляемое значение.
   */
  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const sig = this.signal<T>(undefined as any, signalName || 'unnamed_computed');
    this.effect(() => {
      const newValue = fn();
      // Сигнал сам внутри себя проверит (sig.value === newValue)
      // благодаря правке в пункте №1
      sig.value = newValue;
    });
    return {
      get value() { return sig.value; },
      // Подписываемся на внутренний сигнал
      subscribe: (cb) => sig.subscribe(cb)
    };
  }

  /**
   * Создание реактивного объекта (Proxy).
   * @template T
   * @function reactive
   * @param {T} target - Целевой объект для проксирования.
   * @param {string} [name] - Имя проксируемого объекта.
   * @returns {T} - Реактивный объект.
   */
  public reactive<T extends object>(target: T, name: string = 'reactive'): T {
    if (this.proxyCache.has(target)) return this.proxyCache.get(target);
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
   * Группировка изменений.
   * @function batch
   * @param {Function} fn - Функция для выполнения в группе.
   * @returns {void}
   */
  public batch(fn: () => void): void {
    this.isBatching = true;
    try { fn(); } finally {
      queueMicrotask(() => {
        const effects = Array.from(this.pendingEffects);
        this.pendingEffects.clear();
        this.isBatching = false;
        effects.forEach(e => e.run());
      });
    }
  }

  /**
   * Создание асинхронного ресурса.
   * @template T
   * @function resource
   * @param {Function} fetcher - Функция для загрузки данных.
   * @param {{ value: S }} [source] - Источник данных.
   * @param {string} [signalName] - Имя сигнала ресурса.
   * @returns {Resource<T>} - Асинхронный ресурс.
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
   */
  public setReactAdapters(useState: any, useEffect: any) {
    this.reactAdapters = { useState, useEffect };
  }

  /**
   * Использование реактивного значения в React компоненте.
   * @template T
   * @function use
   * @param {{ value: T; subscribe: (cb: (v: T) => void) => CleanupFn }} item - Реактивный объект.
   * @returns {T} - Значение реактивного объекта.
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
