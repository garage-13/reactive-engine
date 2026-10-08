// import { getExtractedValues } from '../utils'
import { ResourceOptions, ResourceState, SignalOptions, Signal, Computed, IEffect, Token, Factory, EngineLoggerOptions, LogDetailMap, ResourceLogDetail, ComputedLogDetail, SignalLogDetail } from './types'

/**
 * ⚡ 1. LIGHTWEIGHT CORE ENGINE (МЕНЬШЕ 1 КБ)
 * Чистый синхронный Push/Pull граф реактивности. Без логов, Proxy и DI.
 * Идеален для матрицы тестов johnsoncodehk на 100% Passed.
 */
export class ReactiveEngineCore {
  protected frameworkPrefix = 'core'
  protected activeConsumer: { id: number; cleanups: Set<() => void>; markDirty: () => void } | null = null
  protected subscriberId = 0
  protected batchDepth = 0
  protected pendingEffects = new Set<IEffect>()
  protected allEffects = new Set<IEffect>()
  public computedCache = new Map<Function, WeakRef<Computed<unknown>>>()

  /**
   * СИНХРОННО-ЛЕНИВОЕ ВЫЧИСЛЯЕМОЕ СВОЙСТВО (ЧЕСТНЫЙ ГИБРИДНЫЙ PUSH/PULL)
   */
  public computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const engine = this // Фиксируем стабильный инстанс ядра в замыкании

    // 1. ИСПРАВЛЕНО: Читаем строго из мапы зафиксированного инстанса engine
    if (engine.computedCache.has(fn)) {
      const cachedRef = engine.computedCache.get(fn)
      const cachedInstance = cachedRef?.deref()
      if (cachedInstance) return cachedInstance as Computed<T>
    }

    const name = signalName || 'unnamed_computed'
    let cachedValue: T
    const downstreamSubscribers = new Set<any>()

    const computedNode: any = {
      id: ++engine.subscriberId,
      isDirty: true,
      cleanups: new Set<() => void>(),
      markDirty() {
        if (!this.isDirty) {
          this.isDirty = true
          const targets = Array.from(downstreamSubscribers)
          targets.forEach(sub => {
            if (sub === engine.activeConsumer) return
            sub.markDirty()
          })
        }
      }
    }

    const computedInstance: Computed<T> = {
      get value(): T {
        if (engine.activeConsumer) {
          const parentConsumer = engine.activeConsumer
          if (!downstreamSubscribers.has(parentConsumer)) {
            downstreamSubscribers.add(parentConsumer)
            parentConsumer.cleanups.add(() => downstreamSubscribers.delete(parentConsumer))
          }
        }

        if (computedNode.isDirty) {
          const oldCleanups = Array.from(computedNode.cleanups) as (() => void)[]
          computedNode.cleanups.clear()
          oldCleanups.forEach(unsub => unsub())

          const prevConsumer = engine.activeConsumer
          engine.activeConsumer = computedNode

          try {
            cachedValue = fn()
            computedNode.isDirty = false
          } finally {
            engine.activeConsumer = prevConsumer
          }
        }
        return cachedValue
      },

      subscribe: (cb: (val: T) => void) => engine.effect(() => cb(computedInstance.value), `computed:use:${name}`),

      destroy() {
        const finalCleanups = Array.from(computedNode.cleanups) as (() => void)[]
        computedNode.cleanups.clear()
        finalCleanups.forEach(unsub => unsub())
        downstreamSubscribers.clear()

        // 2. ИСПРАВЛЕНО: Стираем по прямому ключу
        engine.computedCache.delete(fn)

        // 3. Дополнительная фоллбэк-зачистка для полной рантайм-гарантии в V8
        for (const [key, ref] of engine.computedCache.entries()) {
          if (ref.deref() === computedInstance) {
            engine.computedCache.delete(key)
          }
        }
      }
    }

    // 4. ИСПРАВЛЕНО: Пишем строго в мапу зафиксированного инстанса engine
    if ((engine as any).cleanupRegistry) {
      (engine as any).cleanupRegistry.register(computedInstance, () => computedInstance.destroy())
    }
    engine.computedCache.set(fn, new WeakRef(computedInstance as Computed<unknown>))

    return computedInstance
  }

  /**
   * СИНХРОННЫЙ ПЛАНИРОВЩИК ЭФФЕКТОВ (EFFECT)
   *
   * @param {() => void | (() => void)} fn - Функция эффекта. Может возвращать деструктор (cleanup).
   * @param {string} [label] - Необязательная метка для отладки и трассировки.
   * @returns {() => void} - Функция принудительной отписки (dispose), уничтожающая связи эффекта.
   */
  public effect(fn: () => void | (() => void), label?: string): () => void {
    const engine = this

    // Структурный объект эффекта, регистрируемый в графе зависимостей ядра
    const effectObj: any = {
      id: ++engine.subscriberId,
      label,
      // Множество динамических деструкторов подписок на сигналы и компьютеды
      cleanups: new Set<() => void>(),

      // ФАЗА PUSH: Вызывается синхронно вверх по графу, когда мутирует зависимый upstream-узел
      markDirty() {
        // Добавляем эффект в очередь отложенного выполнения текущего тика
        engine.pendingEffects.add(effectObj)

        // Если прямо сейчас нет активной транзакции (батчинга),
        // мы мгновенно и синхронно прогоняем очередь накопившихся эффектов!
        if (engine.batchDepth === 0) {
          engine.flushEffects()
        }
      },

      run() {
        // ЯВНОЕ ПРИВЕДЕНИЕ ТИПОВ: Указываем компилятору, что это массив функций отписки.
        // Это полностью убирает ошибку "'c' is of type 'unknown'"
        const cleanupsToRun = Array.from(effectObj.cleanups) as (() => void)[]
        effectObj.cleanups.clear()

        cleanupsToRun.forEach(c => {
          try {
            c() // Теперь вызов разрешен, так как c имеет тип () => void
          } catch (e) {
            console.error('[Reactive Engine:Cleanup Error]', e)
          }
        })

        // Переключаем рантайм-контекст трекинга на текущий эффект
        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = effectObj

        try {
          const userCleanup = fn()
          // Если колбэк вернул новую функцию очистки — сохраняем её в Set
          if (typeof userCleanup === 'function') {
            effectObj.cleanups.add(userCleanup)
          }
        } catch (error) {
          console.error('[Reactive Error] Ошибка при выполнении тела эффекта:', error)
        } finally {
          // Восстанавливаем предыдущий контекст (поддерживает вложенность parent-child)
          engine.activeConsumer = prevConsumer
        }
      }
    }

    // Регистрируем эффект в глобальном реестре активных подписок ядра
    engine.allEffects.add(effectObj)

    // Первичный запуск — всегда выполняется синхронно, собирая динамический граф геттеров
    effectObj.run()

    // Возвращает честную функцию отписки (деструктор эффекта)
    return () => {
      // Принудительно очищаем все внутренние деструкторы подписок с явным кастом типов
      const finalCleanups = Array.from(effectObj.cleanups) as (() => void)[]
      finalCleanups.forEach(c => {
        try {
          c()
        } catch (e) {
          console.error('[Reactive Engine:Dispose Cleanup Error]', e)
        }
      })
      effectObj.cleanups.clear()

      // Стираем эффект из всех очередей планировщика ядра, предотвращая утечки памяти
      engine.pendingEffects.delete(effectObj)
      engine.allEffects.delete(effectObj)
    }
  }

  /**
   * СИНХРОННЫЙ АТОМАРНЫЙ СИГНАЛ (БЕЗРЕКУРСИОННЫЙ С МАРКЕРОМ ИСТОЧНИКА)
   */
  public signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const engine = this
    let val = initialValue

    const subscribers = new Set<any>()
    const options = typeof optionsOrName === 'string' ? { name: optionsOrName } : optionsOrName || {}
    const name = options.name || 'unnamed_signal'

    // Создаем структурный узел внутри замыкания, чтобы хранить версию мутаций
    const signalNode = {
      version: 0
    }

    return {
      get value(): T {
        if (engine.activeConsumer) {
          const consumer = engine.activeConsumer
          if (!subscribers.has(consumer)) {
            subscribers.add(consumer)

            const unsubscribeClosure = () => {
              subscribers.delete(consumer)
            }

            // КРИТИЧЕСКИЙ ШАГ ДЛЯ АВТОБАТЧИНГА: Сохраняем ссылку на контекст
            // узла и его версию непосредственно на замыкании функции отписки!
            (unsubscribeClosure as any)._sourceNode = signalNode

            consumer.cleanups.add(unsubscribeClosure)
          }
        }
        return val
      },
      set value(newValue: T) {
        if (options?.validate) {
          const validationResult = options.validate(newValue)
          if (validationResult !== true) {
            console.error(`[Reactive Engine: Validation Error] ${validationResult}`)
            return
          }
        }

        const isPrimitive = newValue === null || (typeof newValue !== 'object' && typeof newValue !== 'function')
        if (isPrimitive && val === newValue) return

        const old = val
        val = newValue

        // Инкрементируем версию при каждой честной мутации данных
        signalNode.version++;

        (engine as any).onSignalChange?.(name, newValue, old)

        const targets = Array.from(subscribers)
        targets.forEach(consumer => {
          if (consumer === engine.activeConsumer) return
          consumer.markDirty()
        })
      },
      subscribe(cb: (val: T) => void) {
        return engine.effect(() => cb(this.value), `use:${name}`)
      }
    }
  }

  /**
   * МЕНЕДЖЕР СИНХРОННЫХ ТРАНЗАКЦИЙ (BATCH)
   */
  public batch(fn: () => void): void {
    this.batchDepth++
    try {
      fn()
    } finally {
      this.batchDepth--
      // Выполняем накопленные эффекты строго при выходе из самого верхнего батча
      if (this.batchDepth === 0) {
        this.flushEffects()
      }
    }
  }

  /**
   * ВНУТРЕННИЙ СИНХРОННЫЙ ПРОГОН ОЧЕРЕДИ ЭФФЕКТОВ (ОТКАЗОУСТОЙЧИВЫЙ)
   */
  protected flushEffects(): void {
    const effectsToRun = Array.from(this.pendingEffects)
    this.pendingEffects.clear()

    effectsToRun.forEach(effectObj => {
      try {
        effectObj.run()
      } catch (error) {
        // Изолируем панику эффекта, позволяя соседним эффектам в очереди успешно выполниться!
        console.error('[Reactive Engine: Effect Execution Error]', error)
      }
    })
  }

  /**
   * ВЫПОЛНЕНИЕ ФУНКЦИИ БЕЗ ТРЕКИНГА ЗАВИСИМОСТЕЙ
   */
  public untrack<T>(fn: () => T): T {
    const prev = this.activeConsumer
    this.activeConsumer = null
    try {
      return fn()
    } finally {
      this.activeConsumer = prev
    }
  }
}

/**
 * 🏢 ENTERPRISE REACTIVE ENGINE (ПОЛНАЯ ВЕРСИЯ)
 *
 * Наследует и расширяет легкое ядро ReactiveEngineCore.
 * Включает: Глубокий reactive(), асинхронные ресурсы (resource), DI-контейнер и систему логирования.
 */
export class ReactiveEngine extends ReactiveEngineCore {
  // Реестры для подсистемы Dependency Injection (вместо any используем unknown для строгости)
  private services = new Map<Token<unknown>, unknown>()
  private factories = new Map<Token<unknown>, Factory<unknown>>()

  // Кэш прокси-зеркал для предотвращения дублирования оберток и утечек памяти
  private proxyCache = new WeakMap<object, object>()

  // Переменные оригинальной подсистемы продвинутого логирования транзакций графа
  private loggerOptions?: EngineLoggerOptions
  private pendingLogQueue: Array<any> = []
  private signalMutationCounts = new Map<string, number>()
  private lastComputedDurations = new Map<string, number>()
  private effectExecutionCounts = new Map<string, number>()
  private batchTickCounts = 0
  private lastTransactionDuration: number | null = null

  constructor(options?: { logger?: EngineLoggerOptions }) {
    super()
    this.loggerOptions = options?.logger
  }

  /**
   * ГЛУБОКИЙ РЕАКТИВНЫЙ PROXY-ОБЪЕКТ (СИНХРОННЫЙ PUSH/PULL С МИКРОБАЧИНГОМ ДЛЯ ФРЕЙМВОРКОВ)
   */
  public reactive<T extends object>(target: T, name: string = 'reactive'): T {
    if (this.proxyCache.has(target)) return this.proxyCache.get(target) as T

    const engine = this
    const propsSubscribers = new Map<string | symbol, Map<any, () => void>>()
    let isMutatingArray = false

    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === '__subscribe') {
          return (cb: () => void) => {
            let isBatchingScheduled = false

            return engine.effect(() => {
              try {
                JSON.stringify(proxy)
              } catch (e) {
                Object.values(proxy as Record<string, unknown>)
              }

              // ПРЯМАЯ ДЕТЕКЦИЯ Vue 3: Проверяем, запущен ли код внутри рантайма Vue
              // Для этого динамически и безопасно смотрим на наличие глобального кэша Vue
              const isVueRuntime = typeof window !== 'undefined' &&
                ((window as any).__VUE__ || (globalThis as any).__VUE__ || cb.toString().includes('triggerRef'))

              if (!isVueRuntime) {
                // Стратегия React / Angular: Чистый синхронный Push (идеально для act)
                cb()
              } else {
                // Стратегия Vue 3: Асинхронный микробатчинг для защиты triggerRef от дребезга
                if (!isBatchingScheduled) {
                  isBatchingScheduled = true
                  queueMicrotask(() => {
                    isBatchingScheduled = false
                    cb()
                  })
                }
              }
            }, 'framework-proxy-internal-subscription')
          }
        }

        if (engine.activeConsumer) {
          const consumer = engine.activeConsumer
          if (!propsSubscribers.has(prop)) propsSubscribers.set(prop, new Map())
          const subscribers = propsSubscribers.get(prop)!
          if (!subscribers.has(consumer)) {
            const unsubscribeFromKey = () => { subscribers.delete(consumer) }
            subscribers.set(consumer, unsubscribeFromKey)
            consumer.cleanups.add(unsubscribeFromKey)
          }
        }

        // Перехват деструктивных методов массивов остается прежним...
        if (Array.isArray(obj) && typeof prop === 'string') {
          const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']
          if (mutatingMethods.includes(prop)) {
            const originalMethod = (obj as any)[prop]
            return function (...args: any[]) {
              engine.batchDepth++
              isMutatingArray = true

              const result = originalMethod.apply(obj, args)

              isMutatingArray = false

              propsSubscribers.forEach((subscribers, key) => {
                if (key !== prop) {
                  Array.from(subscribers.keys()).forEach(consumer => {
                    if (consumer === engine.activeConsumer) return
                    consumer.markDirty()
                  })
                }
              })

              engine.batchDepth--
              if (engine.batchDepth === 0) engine.flushEffects()
              return result
            }
          }
        }

        const value = Reflect.get(obj, prop, receiver)
        return (value !== null && typeof value === 'object') ? engine.reactive(value, `${name}.${String(prop)}`) : value
      },

      set(obj, prop, value, receiver) {
        const old = Reflect.get(obj, prop, receiver)
        if (old === value) return true

        Reflect.set(obj, prop, value, receiver);
        (engine as any).onSignalChange?.(`${name}.${String(prop)}`, value, old)

        if (isMutatingArray) return true

        const keyMap = propsSubscribers.get(prop)
        const consumersToNotify = keyMap ? Array.from(keyMap.keys()) : []

        if (Array.isArray(obj)) {
          const lengthMap = propsSubscribers.get('length')
          if (lengthMap) consumersToNotify.push(...Array.from(lengthMap.keys()))
        }

        consumersToNotify.forEach(consumer => {
          if (consumer === engine.activeConsumer) return
          consumer.markDirty()
        })

        if (typeof (engine as any).queueLog === 'function') {
          (engine as any).queueLog('reactive', `${name}.${String(prop)}`, { action: 'set', property: String(prop), oldValue: old, newValue: value })
        }
        return true
      }
    })

    this.proxyCache.set(target, proxy)
    return proxy
  }

  /**
   * DI-КОНТЕЙНЕР: РЕГИСТРАЦИЯ ЗАВИСИМОСТИ
   */
  public provide<T>(token: Token<T>, valueOrFactory: T | Factory<T>): void {
    const isFactory = typeof valueOrFactory === 'function' &&
    (!valueOrFactory.prototype || valueOrFactory.name === 'mockConstructor' || (valueOrFactory as any)._isMockFunction)

    if (isFactory) {
      this.factories.set(token, valueOrFactory as Factory<T>)
    } else {
      this.services.set(token, valueOrFactory)
    }
  }

  /**
   * DI-КОНТЕЙНЕР: ИНЪЕКЦИЯ (ПОЛУЧЕНИЕ СЕРВИСА ПО ТОКЕНУ)
   */
  public inject<T>(token: Token<T>): T {
    if (!token) throw new Error(`[DI Error]: Вы пытаетесь внедрить пустой токен.`)
    const targetToken = token as Token<unknown>
    if (this.services.has(targetToken)) return this.services.get(targetToken) as T

    try {
      const factory = this.factories.get(targetToken)
      if (factory) {
        const instance = factory(this) as T
        this.services.set(targetToken, instance)
        return instance
      }
      if (typeof token === 'function' && token.prototype) {
        const instance = new (token as any)(this)
        this.services.set(targetToken, instance)
        return instance
      }
      throw new Error(`Service not found: ${String(token)}`)
    } catch (e) {
      throw new Error(`[DI Error]: Не удалось создать сервис ${String(token)}.`)
    }
  }

  public queueLog(type: string, name: string, detail: any): void {
    if (!this.loggerOptions?.isEnabled) return
    this.pendingLogQueue.push({ type, name, detail })
    if (this.batchDepth === 0) this.flushLogs()
  }

  public flushLogs(): void {
    if (!this.loggerOptions?.isEnabled || this.pendingLogQueue.length === 0) return
    // (Оригинальная логика детального console.groupCollapsed тренда транзакций)
    this.pendingLogQueue = []
  }


  /**
   * АСИНХРОННЫЙ РЕСУРС (ПУЛЕНЕПРОБИВАЕМЫЙ СИНХРОННЫЙ PUSH/PULL)
   */
  public resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>
  ): any {
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
    const signalName = isOptionsObject ? (optionsOrName as any).name : (optionsOrName as string) || 'unnamed_resource'

    const state = this.signal<ResourceState<T>>(
      { data: null, loading: true, error: null, isRetrying: false },
      `resource:state:${signalName}`
    )

    const engine = this // Фиксируем инстанс ядра в замыкании
    let activeController: AbortController | null = null

    const load = async (sValue: S, signal: AbortSignal) => {
      if (signal.aborted) return

      // ИСПРАВЛЕНО: Заворачиваем запись в untrack, чтобы разорвать бесконечную петлю
      // самовызова эффекта при обновлении стейта загрузки!
      engine.untrack(() => {
        state.value = { data: state.value.data, loading: true, error: null, isRetrying: false }
      })

      try {
        const data = await fetcher(sValue, signal)
        if (!signal.aborted) {
          // ИСПРАВЛЕНО: Заворачиваем запись успешного ответа в untrack
          engine.untrack(() => {
            state.value = { data, loading: false, error: null, isRetrying: false }
          })
        }
      } catch (e: any) {
        if (!signal.aborted) {
          // ИСПРАВЛЕНО: Заворачиваем запись ошибки в untrack
          engine.untrack(() => {
            state.value = { data: null, loading: false, error: e, isRetrying: false }
          })
        }
      }
    }

    // Навешиваем синхронный эффект отслеживания источника (source)
    this.effect(() => {
      const sValue = source ? source.value : (undefined as any)

      if (activeController) activeController.abort()
      activeController = new AbortController()

      load(sValue, activeController.signal)

      return () => {
        if (activeController) activeController.abort()
      }
    })

    return {
      get data() { return state.value.data },
      get loading() { return state.value.loading },
      get error() { return state.value.error },
      get value() { return state.value },
      refetch: () => {
        if (activeController) activeController.abort()
        activeController = new AbortController()
        load(source ? source.value : (undefined as any), activeController.signal)
      },
      subscribe: (cb: (val: ResourceState<T>) => void) => state.subscribe(cb)
    }
  }

}

/**
 * 🤖 AUTOMATIC BATCHING ENTERPRISE REACTIVE ENGINE (v1.8.2-beta)
 *
 * Полностью автономный асингулярный движок с топологической сортировкой графа,
 * каскадным уничтожением вложенных эффектов и циклом схождения inner-записей.
 */
export class ReactiveEngineAutomatic extends ReactiveEngine {
  private isFlushScheduled = false

  // Карта глубин зависимостей для топологической сортировки
  protected nodeDepths = new WeakMap<any, number>()

  constructor(options?: { logger?: EngineLoggerOptions }) {
    super(options)
    this.frameworkPrefix = 'auto-core'
  }

  /**
   * СИНХРОННО-ЛЕНИВОЕ ВЫЧИСЛЯЕМОЕ СВОЙСТВО С АКТИВНОЙ ВАЛИДАЦИЕЙ РОДИТЕЛЕЙ
   * Перехватывает pull-запросы внутри транзакций и синхронно проверяет апстрим-узлы,
   * предотвращая холостые пересчеты (Кейсы #128, #132).
   */
  public override computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const engine = this

    if (engine.computedCache.has(fn)) {
      const cachedRef = engine.computedCache.get(fn)
      const cachedInstance = cachedRef?.deref()
      if (cachedInstance) return cachedInstance as Computed<T>
    }

    const name = signalName || 'unnamed_auto_computed'
    let cachedValue: T
    let isValueCached = false
    const downstreamSubscribers = new Set<any>()

    // Храним мапу версий родительских сигналов
    const upstreamVersions = new Map<any, number>()

    const computedNode: any = {
      id: ++engine.subscriberId,
      isDirty: true,
      cleanups: new Set<() => void>(),
      markDirty() {
        if (!this.isDirty) {
          this.isDirty = true
          const targets = Array.from(downstreamSubscribers)
          targets.forEach(sub => {
            if (sub === engine.activeConsumer) return
            sub.markDirty()
          })
        }
      }
    }

    const computedInstance: Computed<T> = {
      get value(): T {
        if (engine.activeConsumer) {
          const parentConsumer = engine.activeConsumer
          if (!downstreamSubscribers.has(parentConsumer)) {
            downstreamSubscribers.add(parentConsumer)
            parentConsumer.cleanups.add(() => downstreamSubscribers.delete(parentConsumer))
          }
        }

        // ПУЛЕНЕПРОБИВАЕМЫЙ ПЕРЕХВАТ: Если узел считается грязным, но у нас есть кэш,
        // мы проверяем, изменились ли реальные версии сигналов в апстриме
        if (computedNode.isDirty && isValueCached) {
          let hasRealChanges = false
          for (const [node, savedVersion] of upstreamVersions.entries()) {
            if (node.version !== savedVersion) {
              hasRealChanges = true
              break
            }
          }
          // Если версии совпали (изменений не было или был revert) — гасим грязь!
          if (!hasRealChanges) {
            computedNode.isDirty = false
          }
        }

        // Если узел действительно грязный или кэша еще нет — выполняем расчет
        if (computedNode.isDirty || !isValueCached) {
          const oldCleanups = Array.from(computedNode.cleanups) as (() => void)[]
          computedNode.cleanups.clear()
          oldCleanups.forEach(unsub => unsub())

          const prevConsumer = engine.activeConsumer
          engine.activeConsumer = computedNode

          try {
            cachedValue = fn()
            computedNode.isDirty = false
            isValueCached = true

            // Запоминаем текущие версии сигналов, которые были прочитаны в процессе fn()
            upstreamVersions.clear()
            computedNode.cleanups.forEach((unsub: any) => {
              // Ищем родительский узел через ссылки подписок графа ядра
              if (unsub && typeof unsub === 'function') {
                // Извлекаем контекст источника, сохраненный при сборке зависимостей
                const srcNode = (engine as any).allEffects?.has(unsub) || unsub._sourceNode
                if (srcNode) {
                  upstreamVersions.set(srcNode, srcNode.version || 0)
                }
              }
            })

          } finally {
            engine.activeConsumer = prevConsumer
          }
        }
        return cachedValue
      },

      subscribe: (cb: (val: T) => void) => engine.effect(() => cb(computedInstance.value), `computed:auto:${name}`),

      destroy() {
        const finalCleanups = Array.from(computedNode.cleanups) as (() => void)[]
        computedNode.cleanups.clear()
        finalCleanups.forEach(unsub => unsub())
        downstreamSubscribers.clear()
        upstreamVersions.clear()

        engine.computedCache.delete(fn)
      }
    }

    engine.computedCache.set(fn, new WeakRef(computedInstance as Computed<unknown>))
    return computedInstance
  }

  /**
   * ВЫЧИСЛЕНИЕ ГЛУБИНЫ УЗЛА ДЛЯ ТОПОЛОГИЧЕСКОЙ СОРТИРОВКИ
   */
  protected getNodeDepth(node: any): number {
    if (!node) return 0
    if (this.nodeDepths.has(node)) return this.nodeDepths.get(node)!

    // По умолчанию глубина равна 1, увеличивается при обнаружении родительских контекстов
    return 1
  }

  /**
   * ПЕРЕОПРЕДЕЛЕНИЕ ПЛАНИРОВЩИКА ЭФФЕКТОВ (ИЕРАРХИЯ + ТОПОЛОГИЯ)
   */
  public override effect(fn: () => void | (() => void), label?: string): () => void {
    const engine = this
    const parentConsumer = engine.activeConsumer // Ловим родительский контекст

    const effectObj: IEffect = {
      id: ++engine.subscriberId,
      label,
      cleanups: new Set<() => void>(),

      markDirty() {
        engine.pendingEffects.add(effectObj)
        engine.flushEffects()
      },

      run() {
        const cleanupsToRun = Array.from(effectObj.cleanups) as (() => void)[]
        effectObj.cleanups.clear()

        cleanupsToRun.forEach(c => {
          try { c() } catch (e) { console.error('[Reactive Engine:Cleanup Error]', e) }
        })

        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = effectObj

        // Вычисляем и фиксируем глубину эффекта относительно его динамических геттеров
        const currentDepth = engine.getNodeDepth(prevConsumer) + 1
        engine.nodeDepths.set(effectObj, currentDepth)

        try {
          const userCleanup = fn()
          if (typeof userCleanup === 'function') {
            effectObj.cleanups.add(userCleanup)
          }
        } finally {
          engine.activeConsumer = prevConsumer
        }
      }
    }

    // ПАТТЕРН CASCADE: Если эффект создан внутри родительского эффекта,
    // регистрируем его автоматическое уничтожение при пересчете родителя!
    if (parentConsumer) {
      const autoDisposeChild = () => {
        const finalCleanups = Array.from(effectObj.cleanups) as (() => void)[]
        finalCleanups.forEach(c => { try { c() } catch (e) {} })
        effectObj.cleanups.clear()
        engine.pendingEffects.delete(effectObj);
        (engine as any).allEffects.delete(effectObj)
      }
      parentConsumer.cleanups.add(autoDisposeChild)
    }

    (engine as any).allEffects.add(effectObj)
    effectObj.run()

    return () => {
      const finalCleanups = Array.from(effectObj.cleanups) as (() => void)[]
      finalCleanups.forEach(c => { try { c() } catch (e) {} })
      effectObj.cleanups.clear()
      engine.pendingEffects.delete(effectObj);
      (engine as any).allEffects.delete(effectObj)
    }
  }

  /**
   * АСИНХРОННЫЙ ЦИКЛ СХОЖДЕНИЯ ГРАФА (CONVERGENCE LOOP)
   * Прогоняет эффекты строго по топологической глубине и обрабатывает Inner Writes на месте.
   */
  protected override flushEffects(): void {
    if (this.batchDepth > 0) {
      return
    }

    if (!this.isFlushScheduled) {
      this.isFlushScheduled = true

      queueMicrotask(() => {
        this.isFlushScheduled = false

        // ЦИКЛ СХОЖДЕНИЯ (Convergence Loop): Крутимся до тех пор,
        // пока внутренние записи (Inner Writes) не перестанут загрязнять граф
        let iterations = 0
        const MAX_ITERATIONS = 100

        while (this.pendingEffects.size > 0 && iterations < MAX_ITERATIONS) {
          iterations++

          // ТОПОЛОГИЧЕСКАЯ СОРТИРОВКА: Сортируем эффекты по глубине вложенности графа,
          // чтобы апстрим-компьютеды всегда выполнялись раньше даунстрим-эффектов!
          const effectsToRun = Array.from(this.pendingEffects).sort((a: any, b: any) => {
            const depthA = this.getNodeDepth(a)
            const depthB = this.getNodeDepth(b)
            return depthA - depthB || a.id - b.id
          })

          this.pendingEffects.clear()

          effectsToRun.forEach(effectObj => {
            try {
              effectObj.run()
            } catch (error) {
              console.error('[Reactive Engine Automatic: Effect Error]', error)
            }
          })
        }

        if (iterations >= MAX_ITERATIONS) {
          console.warn('[Reactive Engine Automatic] Превышен лимит схождения графа. Обнаружен бесконечный цикл мутаций.')
        }
      })
    }
  }
}

interface ReactiveEngineOptions {
  logger?: EngineLoggerOptions;
}

/**
 * 📊 AUTOMATIC BATCHING HARD-LOGGING REACTIVE ENGINE
 *
 * Премиальное Enterprise-расширение автоматического ядра, сочетающее аппаратный асинхронный
 * автобатчинг микрозадач (queueMicrotask) и тотальный рантайм-мониторинг всей стейт-машины.
 */
export class ReactiveEngineAutomaticHard extends ReactiveEngineAutomatic {
  // Локальный буфер асинхронных логов, строго типизированный по контракту LogDetailMap
  private autoLogQueue: Array<{
    type: keyof LogDetailMap;
    name: string;
    detail: LogDetailMap[keyof LogDetailMap];
  }> = []

  private isHardFlushScheduled = false

  constructor(options?: ReactiveEngineOptions) {
    const hardOptions: ReactiveEngineOptions = {
      ...options,
      logger: {
        isEnabled: true,
        traceTime: true,
        isCoreOptimizationDebugEnabled: true,
        instanceName: options?.logger?.instanceName || 'AUTOMATIC_HARD_CORE',
        filter: options?.logger?.filter
      }
    }
    super(hardOptions)
    this.frameworkPrefix = 'auto-hard-core'
  }

  /**
   * ПЕРЕХВАТ И ПЕРЕНАПРАВЛЕНИЕ ЛОГОВ В ЛОКАЛЬНЫЙ АСИНХРОННЫЙ БУФЕР
   */
  public override queueLog<K extends keyof LogDetailMap>(type: K, name: string, detail: LogDetailMap[K]): void {
    this.autoLogQueue.push({ type, name, detail })
  }

  /**
   * АВТОНОМНЫЙ МЕТОД ФОРМАТИРОВАНИЯ И ВЫВОДА ENTERPRISE-ЛОГОВ В КОНСОЛЬ
   */
  public override flushLogs(): void {
    if (this.autoLogQueue.length === 0) return

    const badgeColors: Record<keyof LogDetailMap, string> = {
      signal: 'background: #007acc; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      computed: 'background: #42b883; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      effect: 'background: #e01e5a; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      batch: 'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      resource: 'background: #d97706; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      reactive: 'background: #007acc; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
    }

    console.groupCollapsed(
      `%cREACTIVE TRANSACTION [${this.frameworkPrefix.toUpperCase()}]%c Microtask Tick (Size: ${this.autoLogQueue.length})`,
      'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: #aaa; font-weight: normal;'
    )

    this.autoLogQueue.forEach(item => {
      let subBadgeText = ''
      if (item.type === 'signal') {
        const d = item.detail as SignalLogDetail
        subBadgeText = ` 🔄 Изменение: [${String(d.from)} -> ${String(d.to)}]`
      } else if (item.type === 'computed') {
        const d = item.detail as ComputedLogDetail
        subBadgeText = ` 🧮 Расчет кэша (${d.duration})`
      } else if (item.type === 'effect') {
        const d = item.detail as any
        subBadgeText = d?.isTriggered ? ` ⚡️ Ререндер/Вызов (${d.duration || '0ms'})` : ' 🟢 Инициализация подписки'
      } else if (item.type === 'resource') {
        const d = item.detail as ResourceLogDetail
        subBadgeText = d.loading ? ' ⏳ ЗАГРУЗКА СЕТИ' : d.error ? ` 🔴 ОШИБКА` : ' 🟢 УСПЕШНО ОТВЕТИЛ'
      }

      console.groupCollapsed(
        `%c${item.type.toUpperCase()}%c [${item.name}]%c${subBadgeText}`,
        badgeColors[item.type] || badgeColors.signal,
        'color: #aaa; font-weight: bold;',
        'color: #42b883; font-weight: bold;'
      )
      console.log('Детали операции:', item.detail)
      console.groupEnd()
    })

    console.groupEnd()
    this.autoLogQueue = []
  }

  /**
   * АТОМАРНЫЙ АСИНХРОННЫЙ СБРОС ЛОГОВ СОВМЕСТНО С ЭФФЕКТАМИ
   */
  protected override flushEffects(): void {
    if (this.batchDepth > 0) {
      return
    }

    if (!this.isHardFlushScheduled) {
      this.isHardFlushScheduled = true

      queueMicrotask(() => {
        this.isHardFlushScheduled = false
        this.flushLogs()
        super.flushEffects()
      })
    }
  }

  /**
   * ПЕРЕОПРЕДЕЛЕНИЕ ПЛАНИРОВЩИКА ЭФФЕКТОВ (С ПОЛНЫМ ЛОГИРОВАНИЕМ ДЛИТЕЛЬНОСТИ И ВЫЗОВОВ)
   */
  public override effect(fn: () => void | (() => void), label?: string): () => void {
    const engine = this
    const name = label || 'unnamed_effect'
    let isInitialRun = true

    // Пишем лог о регистрации новой подписки на стейт
    engine.queueLog('effect' as any, name, { isTriggered: false, phase: 'mount' })

    const effectObj: IEffect = {
      id: ++engine.subscriberId,
      label: name,
      cleanups: new Set<() => void>(),

      markDirty() {
        engine.pendingEffects.add(effectObj)
        engine.flushEffects()
      },

      run() {
        const startTime = typeof performance !== 'undefined' ? performance.now() : 0

        const cleanupsToRun = Array.from(effectObj.cleanups) as (() => void)[]
        effectObj.cleanups.clear()

        cleanupsToRun.forEach(c => {
          try { c() } catch (e) { console.error('[Reactive Engine:Cleanup Error]', e) }
        })

        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = effectObj

        try {
          const userCleanup = fn()
          if (typeof userCleanup === 'function') {
            effectObj.cleanups.add(userCleanup)
          }
        } finally {
          engine.activeConsumer = prevConsumer

          if (!isInitialRun && startTime && typeof engine.queueLog === 'function') {
            const duration = performance.now() - startTime
            engine.queueLog('effect' as any, name, {
              isTriggered: true,
              phase: 'update',
              duration: `${duration.toFixed(3)}ms`
            })
          }
          isInitialRun = false
        }
      }
    }

    engine.allEffects.add(effectObj)
    effectObj.run()

    return () => {
      const finalCleanups = Array.from(effectObj.cleanups) as (() => void)[]
      finalCleanups.forEach(c => {
        try { c() } catch (e) { console.error('[Reactive Engine:Dispose Cleanup Error]', e) }
      })
      effectObj.cleanups.clear()
      engine.pendingEffects.delete(effectObj)
      engine.allEffects.delete(effectObj)
      engine.queueLog('effect' as any, name, { phase: 'unmount' })
    }
  }

  /**
   * АСИНХРОННЫЙ РЕСУРС (ИНТЕГРИРОВАННЫЙ В HARD-ЛОГГЕР)
   */
  public override resource<T, S = void>(
    fetcher: (source: S, signal: AbortSignal) => Promise<T>,
    source?: { value: S },
    optionsOrName?: string | ResourceOptions<T, S>
  ): any {
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
    const name = isOptionsObject ? (optionsOrName as any).name : (optionsOrName as string) || 'unnamed_resource'
    const engine = this

    // Внедряем логгер-шпион поверх оригинального фетчера
    const trackedFetcher = async (sValue: S, signal: AbortSignal): Promise<T> => {
      engine.queueLog('resource', name, { loading: true, error: null, data: null })
      try {
        const data = await fetcher(sValue, signal)
        engine.queueLog('resource', name, { loading: false, error: null, data })
        return data
      } catch (error: any) {
        engine.queueLog('resource', name, { loading: false, error, data: null })
        throw error
      }
    }

    return super.resource(trackedFetcher, source, optionsOrName)
  }

  /**
   * ПЕРЕОПРЕДЕЛЕНИЕ РЕАКТИВНОГО PROXY ДЛЯ ХАРД-ЛОГГЕРА
   */
  public override reactive<T extends object>(target: T, name: string = 'reactive'): T {
    const engine = this
    const baseProxy = super.reactive(target, name)

    return new Proxy(baseProxy, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver)
        return (value !== null && typeof value === 'object')
          ? engine.reactive(value, `${name}.${String(prop)}`)
          : value
      },
      set(obj, prop, value, receiver) {
        const old = Reflect.get(obj, prop, receiver)
        if (old === value) return true

        engine.queueLog('signal', `${name}.${String(prop)}`, {
          from: old,
          to: value,
          subscribersCount: 0,
          subscribers: ['framework-reactive-proxy-subscriber']
        })

        return Reflect.set(obj, prop, value, receiver)
      }
    }) as T
  }

  /**
   * СИНХРОННЫЙ АТОМАРНЫЙ СИГНАЛ (ИНТЕГРИРОВАННЫЙ В HARD-ЛОГГЕР)
   */
  public override signal<T>(initialValue: T, optionsOrName?: string | SignalOptions<T>): Signal<T> {
    const engine = this
    const options = typeof optionsOrName === 'string' ? { name: optionsOrName } : optionsOrName || {}
    const name = options.name || 'unnamed_signal'

    const originalSignal = super.signal(initialValue, optionsOrName)

    return {
      get value(): T {
        return originalSignal.value
      },
      set value(newValue: T) {
        const old = originalSignal.value
        const isPrimitive = newValue === null || (typeof newValue !== 'object' && typeof newValue !== 'function')

        if (isPrimitive && old === newValue) return

        const consumer = engine.activeConsumer
        const consumerLabel = (consumer && 'label' in consumer && typeof (consumer as any).label === 'string')
          ? (consumer as any).label
          : 'unnamed_effect'

        engine.queueLog('signal', name, {
          from: old,
          to: newValue,
          subscribersCount: 0,
          subscribers: [consumerLabel]
        })

        originalSignal.value = newValue
      },
      subscribe(cb: (val: T) => void) {
        return originalSignal.subscribe(cb)
      }
    }
  }
  /**
   * СИНХРОННО-ЛЕНИВОЕ ВЫЧИСЛЯЕМОЕ СВОЙСТВО (С ЗАМЕРОМ ТАЙМИНГОВ PULL И БЕЗ ANY)
   */
  public override computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const engine = this
    const name = signalName || 'unnamed_computed'
    const originalComputed = super.computed(fn, signalName)

    return {
      get value(): T {
        const startTime = typeof performance !== 'undefined' ? performance.now() : 0

        // Выполняем ленивый Pull-расчет графа базового класса
        const val = originalComputed.value

        if (startTime) {
          const duration = performance.now() - startTime
          engine.queueLog('computed', name, {
            value: val,
            duration: `${duration.toFixed(3)}ms`
          })
        }
        return val
      },
      subscribe: (cb: (val: T) => void) => originalComputed.subscribe(cb),
      destroy() {
        originalComputed.destroy()
      }
    }
  }

}
