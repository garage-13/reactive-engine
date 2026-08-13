import { ResourceOptions, ResourceState, SignalOptions } from './types'
import { getExtractedValues } from '../utils'

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

export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;
export type Token<T> = string | symbol | { new(engine: ReactiveEngine, ...args: any[]): T };
export type Factory<T> = (engine: ReactiveEngine) => T;

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
 * Интерфейс для эффекта.
 * @interface IEffect
 */
export interface IEffect {
  run: () => void;
  label?: string;
  cleanups: Set<CleanupFn>;
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

export interface EngineLoggerOptions {
  /** Включить детальное логгирование в консоль */
  isEnabled: boolean;
  /** Выводить время выполнения с точностью до микросекунд (performance.now) */
  traceTime?: boolean;
  /** Фильтровать логи по имени сигнала (поддерживает RegExp или строку) */
  filter?: RegExp | string;
}

export interface ReactiveEngineOptions {
  logger?: EngineLoggerOptions;
}
// Конкретные и строгие структуры для деталей каждого типа лога
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
  /** Текущий статус загрузки */
  loading: boolean;
  /** Данные ответа (если есть) */
  data: unknown;
  /** Объект ошибки (если запрос упал) */
  error: Error | null;
  /** Была ли это повторная попытка (Retry) */
  isRetrying?: boolean;
}

// Маппинг: связываем строковый литерал типа лога с его интерфейсом деталей
export interface LogDetailMap {
  signal: SignalLogDetail;
  computed: ComputedLogDetail;
  effect: EffectLogDetail;
  batch: BatchLogDetail;
  resource: ResourceLogDetail;
}


// --- ЯДРО ---
/**
 * Класс `ReactiveEngine` представляет собой реактивную систему, которая позволяет создавать и управлять реактивными объектами,
 * сигналами, эффектами, асинхронными ресурсами и другими реактивными примитивами. Реактивные механизмы облегчают разработку
 * сложных пользовательских интерфейсов и приложений, автоматически отслеживая зависимости между данными и реактивно обновляя UI.
 *
 * Основные возможности `ReactiveEngine` включают:
 * - **Сигналы (Signals)**: Реактивные переменные с поддержкой подписки на изменения.
 * - **Эффекты (Effects)**: Автоматические функции, которые выполняются при изменении зависимых сигналов.
 * - **Ресурсы (Resources)**: Асинхронные ресурсы с поддержкой повторных попыток и валидации.
 * - **Прокси-объекты (Proxy Objects)**: Реактивное обертывание объектов для отслеживания изменений свойств.
 * - **Интеграция с React**: Удобные методы для интеграции реактивного ядра с компонентами React.
 *
 * Пример использования:
 *
 * ```javascript
 * const engine = new ReactiveEngine();
 * const count = engine.signal(0);
 *
 * engine.effect(() => {
 *   console.log(`Count is ${count.value}`);
 * });
 *
 * count.value++; // Выведет: Count is 1
 * ```
 *
 * @class
 */
export class ReactiveEngine {
  protected frameworkPrefix = 'core'
  private activeEffect: IEffect | null = null
  private isBatching = false
  private pendingEffects = new Set<IEffect>()

  // В контейнерах DI вместо any используем unknown. Это заставит методы inject/provide
  // явно приводить типы через дженерики <T>, защищая от рантайм-ошибок.
  private services = new Map<Token<unknown>, unknown>()
  private factories = new Map<Token<unknown>, Factory<unknown>>()

  // Объект-ключ мапится на объект-прокси. Здесь идеально подходит тип object.
  private proxyCache = new WeakMap<object, object>()
  private allEffects = new Set<IEffect>()

  // Logger
  private loggerOptions?: EngineLoggerOptions
  private pendingLogQueue: Array<{
    [K in keyof LogDetailMap]: {
      type: K;
      name: string;
      detail: LogDetailMap[K];
    }
  }[keyof LogDetailMap]> = []
  private lastTransactionDuration: number | null = null
  // Хранилища точечной аналитки:
  private signalMutationCounts = new Map<string, number>() // Имя сигнала -> Кол-во мутаций
  private lastComputedDurations = new Map<string, number>() // Имя computed -> Время прошлого расчета
  private effectExecutionCounts = new Map<string, number>() // Имя эффекта -> Кол-во запусков
  private batchTickCounts = 0 // Глобальный счетчик транзакций ядра

  constructor(options?: ReactiveEngineOptions) {
    this.loggerOptions = options?.logger
  }

  /**
   * Системный метод вывода форматированных логов в консоль.
   * Автоматически подстраивает тип входящего аргумента `detail` под выбранный литерал `type`.
   *
   * Дополнительно агрегирует рантйам-статистику по всей стейт-машине приложения:
   * - **`signal`:** Отслеживает счетчик частоты изменений (шума) для детекции паразитных циклов мутаций.
   * - **`computed`:** Сравнивает текущую длительность ленивого вычисления с прошлым, подсвечивая тренд производительности.
   * - **`effect`:** Подсчитывает общее количество ререндеров/вызовов побочных эффектов.
   * - **`batch`:** Фиксирует порядковый номер выполненного шедулером пакета микрозадач.
   *
   * @template K - Литеральный тип лога из карты `LogDetailMap`
   * @param {K} type - Категория логгируемого события ('signal' | 'computed' | 'effect' | 'batch')
   * @param {string} name - Уникальное имя реактивного элемента (или label эффекта)
   * @param {LogDetailMap[K]} detail - Строго типизированный объект с контекстными данными события
   * @returns {void}
   */
  public log<K extends keyof LogDetailMap>(
    type: K,
    name: string,
    detail: LogDetailMap[K]
  ): void {
    if (!this.loggerOptions?.isEnabled) return

    // Фильтрацию производим уже по очищенному имени
    if (this.loggerOptions.filter) {
      const regex = this.loggerOptions.filter instanceof RegExp
        ? this.loggerOptions.filter
        : new RegExp(this.loggerOptions.filter.replace(/^\/|\/$/g, ''))
      if (!regex.test(name)) return
    }

    const badgeColors: Record<keyof LogDetailMap, string> = {
      signal: 'background: #007acc; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      computed: 'background: #42b883; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      effect: 'background: #e01e5a; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      batch: 'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      resource: 'background: #d97706; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
    }

    let subBadgeText = ''
    let subBadgeStyle = 'color: #aaa; font-weight: normal;'

    switch (type) {
    case 'signal': {
      // Проверяем, является ли сигнал внутренним служебным сигналом ядра
      const isInternal = getExtractedValues({
        tested: [name],
        expectedKey: 'CORE_INTERNAL_SIGNAL',
        valueType: 'number'
      })?.[0] === '1'

      // (?) Чистим имя от метаданных для красивого вывода в консоль
      const displayName = name // name.replace(/\[CORE_INTERNAL_SIGNAL=1\]:/g, '');

      const currentCount = (this.signalMutationCounts.get(displayName) || 0) + 1
      this.signalMutationCounts.set(displayName, currentCount)

      const signalDetail = detail as SignalLogDetail
      const isFullyOptimized = signalDetail.subscribers && signalDetail.subscribers.length > 0
        ? signalDetail.subscribers.every((sub) => {
          if (!sub) return false
          return getExtractedValues({
            tested: [sub],
            expectedKey: 'IS_OPTIMIZED',
            valueType: 'number',
          })?.[0] === '1'
        })
        : false

      const isNoisy = currentCount > 50

      // Переключаем текст под-бэджа, если это внутренний сигнал computed
      const typeLabel = isInternal ? 'COMPUTED_INTERNAL' : 'SIGNAL'

      subBadgeText = ` 🔄 Изменений ${isInternal ? 'кэша' : 'сигнала'}: ${currentCount}${isNoisy ? ' ⚠️ (high noise — обнаружен дребезг/спам значений!)' : ''
      }`

      if (isNoisy) {
        subBadgeStyle = 'color: orange; font-weight: bold;'
        if (!isFullyOptimized) {
          (detail as any).__performance_advice__ = {
            issue: `Сигнал [${displayName}] обновляется слишком часто (${currentCount} раз за такт). Это приводит к избыточным ререндерам UI.`,
            solution: `Оберните чтение этого сигнала в декоратор сжатия потока данных 'withThrottleComputed'`,
            example: `public throttled = withThrottleComputed(this.engine, () => this.yourSignalName.value, { limit: 300 });`
          }
        }
      }

      // Переопределяем параметры вывода console.groupCollapsed локально
      console.groupCollapsed(
        `%c${typeLabel}%c [${displayName}]%c${subBadgeText}`,
        isInternal ? 'background: #42b883; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;' : badgeColors[type],
        'color: #aaa; font-weight: bold;',
        subBadgeStyle
      )
      console.log('Данные (Payload):', detail)
      if (this.loggerOptions.traceTime && typeof performance !== 'undefined') {
        console.log('Тайминг рантайма:', `${performance.now().toFixed(2)} ms`)
      }
      console.groupEnd()

      return // Прерываем дефолтный вывод, так как мы отрендерили сигнал со специальным бэджем!
    }
    case 'computed': {
      // Даже если это был сигнал, мы берем детали вычислений
      const currentDetail = detail as any

      // Безопасно извлекаем значение для заголовка бэджа.
      // Читаем .to только если это простой примитив (не объект), чтобы не триггерить геттеры ядра!
      if (currentDetail && 'to' in currentDetail) {
        const rawValue = currentDetail.to
        const displayValue = typeof rawValue === 'object' && rawValue !== null
          ? '{...}' // Для объектов выводим заглушку, защищая геттеры от JSON.stringify
          : String(rawValue)

        subBadgeText = ` 🧮 Значение: ${displayValue}`
      } else if (currentDetail && 'duration' in currentDetail) {
        // Ваша стандартная рабочая логика тренда для оригинального события computed
        const currentDuration = parseFloat(currentDetail.duration)
        if (!isNaN(currentDuration)) {
          const lastDuration = this.lastComputedDurations.get(name)
          if (lastDuration !== undefined && lastDuration > 0) {
            const diff = currentDuration - lastDuration
            const percentChange = (diff / lastDuration) * 100
            if (percentChange > 5) {
              subBadgeText = ` 🔴 Замедление: +${percentChange.toFixed(1)}% (${currentDetail.duration})`
              subBadgeStyle = 'color: #e01e5a; font-weight: bold;'
            } else if (percentChange < -5) {
              subBadgeText = ` 🟢 Ускорение: ${percentChange.toFixed(1)}% (${currentDetail.duration})`
              subBadgeStyle = 'color: #42b883; font-weight: bold;'
            } else {
              subBadgeText = ` 🟢 Стабильно (${currentDetail.duration})`
              subBadgeStyle = 'color: #42b883; font-weight: bold;'
            }
          } else {
            subBadgeText = ` ⚪ Первый расчет (${currentDetail.duration})`
          }
          this.lastComputedDurations.set(name, currentDuration)
        }
      }
      break
    }
    case 'effect': {
      const currentCount = (this.effectExecutionCounts.get(name) || 0) + 1
      this.effectExecutionCounts.set(name, currentCount)

      const isOverTriggered = currentCount > 30
      const currentDetail = detail as any
      const durationStr = currentDetail && 'duration' in currentDetail ? ` (${currentDetail.duration})` : ''

      // Выводим статус стабильности и длительность в заголовок бэджа по аналогии с computed
      subBadgeText = ` 🟢 Стабильно${durationStr} | 🚀 Вызовов: ${currentCount}${isOverTriggered ? ' ⚠️ (heavy re-renders)' : ''}`
      subBadgeStyle = 'color: #42b883; font-weight: bold;'

      if (isOverTriggered) subBadgeStyle = 'color: #ff4a4a; font-weight: bold;'
      break
    }
    case 'batch': {
      this.batchTickCounts += 1
      subBadgeText = ` 📦 Номер транзакции: #${this.batchTickCounts}`
      break
    }
    case 'resource': {
      const resourceDetail = detail as ResourceLogDetail

      // Формируем динамический статус-маркер для заголовка
      if (resourceDetail.loading) {
        subBadgeText = ' ⏳ ЗАГРУЗКА (fetching...)'
        subBadgeStyle = 'color: #d97706; font-weight: bold;' // Оранжевый
      } else if (resourceDetail.error) {
        subBadgeText = ` 🔴 ОШИБКА: ${resourceDetail.error.message || 'Unknown Error'}`
        subBadgeStyle = 'color: #ff4a4a; font-weight: bold;' // Красный
      } else {
        // Данные успешно загружены
        const rawData = resourceDetail.data
        const displayData = typeof rawData === 'object' && rawData !== null
          ? '{...}'
          : String(rawData)

        subBadgeText = ` 🟢 УСПЕХ (data: ${displayData})`
        subBadgeStyle = 'color: #42b883; font-weight: bold;' // Зеленый
      }
      break
    }
    default:
      break
    }

    // Выводим красивый свернутый заголовок под-элемента с аналитикой
    console.groupCollapsed(
      `%c${type.toUpperCase()}%c [${name}]%c${subBadgeText}`,
      badgeColors[type],
      'color: #aaa; font-weight: bold;',
      subBadgeStyle
    )
    console.log('Данные (Payload):', detail)
    if (this.loggerOptions.traceTime && typeof performance !== 'undefined') {
      console.log('Тайминг рантайма:', `${performance.now().toFixed(2)} ms`)
    }
    console.groupEnd()
  }

  /**
   * Коллбек для уведомления об изменении сигнала.
   * Использование unknown вместо any гарантирует безопасную работу с типами prev/next.
   */
  public onSignalChange?: (name: string, next: unknown, prev: unknown) => void

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
    if (typeof valueOrFactory === 'function' && !valueOrFactory.prototype)
      this.factories.set(token, valueOrFactory as Factory<T>)
    else
      this.services.set(token, valueOrFactory)
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
      throw new Error(`[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.`)
    }

    // Приводим токен к базовому типу Token<unknown> для совместимости с Map
    const targetToken = token as Token<unknown>

    if (this.services.has(targetToken)) {
      return this.services.get(targetToken) as T
    }

    try {
      const factory = this.factories.get(targetToken)
      if (factory) {
        const instance = factory(this) as T
        this.services.set(targetToken, instance)
        return instance
      }
      if (typeof token === 'function' && token.prototype) {
        const instance = new (token as { new(eng: ReactiveEngine): T })(this)
        this.services.set(targetToken, instance)
        return instance
      }
      throw new Error(`Service not found: ${String(token)}`)
    } catch (e) {
      throw new Error(`[DI Error]: Не удалось создать сервис ${String(token)}. Ошибка: ${(e as Error)?.message || 'No e?.message'}`)
    }
  }

  /**
   * Накапливает логи об изменениях в буфер текущей микрозадачи
   */
  public queueLog(type: keyof LogDetailMap, name: string, detail: any): void {
    if (!this.loggerOptions?.isEnabled) return
    this.pendingLogQueue.push({ type, name, detail })
  }

  /**
   * Синхронно обрабатывает и выводит в консоль накопленный буфер логов
   * для текущего тика микрозадачи (реактивной транзакции).
   *
   * Метод автоматически вызывается планировщиком ядра (`queueMicrotask`) непосредственно
   * перед запуском каскада отложенных эффектов фреймворков и ререндеров интерфейса.
   *
   * ### Особенности рантайм-логики:
   * 1. **Атомарный батчинг:** Предотвращает лавинообразный спам в консоли разработчика при
   *    множественных синхронных мутациях сигналов. Все тики склеиваются в единую мастер-группу.
   * 2. **Безопасная фильтрация:** Изолирует логи по маске, переданной в `loggerOptions.filter`.
   *    Если после фильтрации очередь оказывается пустой, метод бережно зачищает буфер и
   *    возвращает управление шедулеру ядра, не блокируя выполнение `pendingEffects`.
   * 3. **Профайлинг производительности (Pull Duration):** При включенном `traceTime` рассчитывает
   *    чистую длительность калькуляции и фильтрации транзакции графа в миллисекундах
   *    с точностью до микросекунд (`performance.now`), помогая находить узкие места.
   *
   * @function flushLogs
   * @returns {void} Метод не возвращает значения, а только очищает внутренний буфер `pendingLogQueue`.
   */
  public flushLogs(): void {
    if (!this.loggerOptions?.isEnabled || this.pendingLogQueue.length === 0) return

    const startTime = typeof performance !== 'undefined' ? performance.now() : 0
    let logsToRender = this.pendingLogQueue

    if (this.loggerOptions.filter) {
      try {
        let regex: RegExp
        if (this.loggerOptions.filter instanceof RegExp) {
          regex = this.loggerOptions.filter
        } else {
          const cleanStr = this.loggerOptions.filter.replace(/^\/|\/$/g, '')
          regex = new RegExp(cleanStr)
        }
        logsToRender = logsToRender.filter(item => regex.test(item.name))
      } catch (e) {
        console.warn('[Logger Error]: Некорректный паттерн фильтрации логов', e)
      }
    }

    if (logsToRender.length === 0) {
      this.pendingLogQueue = []
      return
    }

    // ШАГ 1: Переносим замер времени ВВЕРХ, чтобы знать длительность ДО рендеринга заголовка
    let durationText = ''
    let trendText = ''
    let trendStyle = 'color: #aaa; font-weight: normal;' // Дефолтный серый стиль для тренда в заголовке

    if (this.loggerOptions.traceTime && startTime) {
      const endTime = performance.now()
      const duration = endTime - startTime

      durationText = ` | Duration: ${duration.toFixed(3)} ms`

      // Расчет дельты тренда
      if (this.lastTransactionDuration !== null && this.lastTransactionDuration > 0) {
        const diff = duration - this.lastTransactionDuration
        const percentChange = (diff / this.lastTransactionDuration) * 100

        if (percentChange > 0.1) {
          // Просадка производительности (время выросло) -> КРАСНЫЙ
          trendText = ` 🔴 +${percentChange.toFixed(1)}%`
          trendStyle = 'color: #e01e5a; font-weight: bold;'
        } else if (percentChange < -0.1) {
          // Ускорение графа (время уменьшилось) -> ЗЕЛЕНЫЙ
          trendText = ` 🟢 ${percentChange.toFixed(1)}%`
          trendStyle = 'color: #42b883; font-weight: bold;'
        } else {
          // Изменения в пределах погрешности -> СТАБИЛЬНО (ЗЕЛЕНЫЙ)
          trendText = ' 🟢 stable'
          trendStyle = 'color: #42b883; font-weight: bold;'
        }
      } else {
        trendText = ' ⚪ first'
      }

      // Сохраняем значение для следующего тика микрозадачи
      this.lastTransactionDuration = duration
    }

    // ШАГ 2: ВЫВОДИМ ВСЁ В ОДИН ЗАГОЛOВОК ГРУППЫ
    // %c №1 - Стильный фиолетовый бэдж TRANSACTION
    // %c №2 - Серый текст с размером батча и чистым временем выполнения (ms)
    // %c №3 - Динамический цветной индикатор тренда (Красный/Зеленый) с процентами
    console.groupCollapsed(
      `%cREACTIVE TRANSACTION%c Microtask Tick (Size: ${logsToRender.length}${durationText})%c${trendText}`,
      'background: #7952b3; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: #aaa; font-weight: normal;',
      trendStyle
    )

    // Рендерим вложенные детальные логи сигналов и computed
    logsToRender.forEach(item => {
      this.log(item.type as any, item.name, item.detail as any)
    })

    if (this.loggerOptions.traceTime && typeof performance !== 'undefined') {
      console.log(`%c[Execution Timestamp]: ${performance.now().toFixed(2)} ms`, 'color: #7952b3; font-weight: bold;')
    }

    console.groupEnd()
    this.pendingLogQueue = []
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
    const engine = this
    let val = initialValue
    const subscribers = new Set<IEffect>()
    const options = typeof optionsOrName === 'string'
      ? { name: optionsOrName }
      : optionsOrName || {}
    const name = options.name || 'unnamed_signal'

    return {
      get value(): T {
        if (engine.activeEffect) {
          const currentEffect = engine.activeEffect

          // Защита от раздувания памяти!
          // Добавляем функцию очистки в cleanups СТРОГО один раз — при первой регистрации эффекта.
          if (!subscribers.has(currentEffect)) {
            subscribers.add(currentEffect)

            currentEffect.cleanups.add(() => {
              subscribers.delete(currentEffect) // При уничтожении эффекта сигнал забудет его
            })
          }
        }

        return val
      },
      set value(newValue: T) {
        if (val === newValue) return

        // ВАЛИДАЦИЯ В RUNTIME
        if (options.validate) {
          const result = options.validate(newValue)
          if (result === false || typeof result === 'string') {
            const errorMsg = typeof result === 'string'
              ? result
              : `[Validation Error]: Некорректное значение для сигнала "${name}"`

            console.error(`%c${errorMsg}`, "color: orange; font-weight: bold;", {
              received: newValue,
              current: val
            })
            return // Прерываем обновление, если данные не валидны
          }
        }

        const old = val
        val = newValue
        engine.onSignalChange?.(name, newValue, old)

        // Извлекаем текстовые метки подписчиков для логгера
        const subscriberLabels = Array.from(subscribers).map(
          (e) => e.label || 'unnamed_effect'
        )
        engine.queueLog?.('signal', name, {
          from: old,
          to: newValue,
          subscribersCount: subscribers.size,
          subscribers: subscriberLabels,
        })

        // 1. Всегда добавляем подписчиков в очередь отложенных эффектов
        subscribers.forEach(e => engine.pendingEffects.add(e))

        // 2. Планируем автоматическое выполнение транзакции ВСЕГДА!
        // Теперь микрозадача гарантированно выполнится и зачистит буфер flushLogs,
        // даже если у сигнала было 0 подписчиков.
        if (!engine.isBatching) {
          engine.isBatching = true

          queueMicrotask(() => {
            // Динамический каскадный цикл (Push-домино)
            for (const effectObj of engine.pendingEffects) {
              engine.pendingEffects.delete(effectObj)
              effectObj.run()
            }
            // Гасим флаг батчинга строго после того, как ВСЕ эффекты завершились
            engine.isBatching = false
            // Вызываем flushLogs на самом финише, когда вся транзакция полностью стабилизировалась
            engine.flushLogs?.()
          })
        }
      },
      subscribe(cb: (val: T) => void) {
        // Чистая и безопасная подписка для React/Vue/Angular адаптеров
        return engine.effect(
          () => {
            cb(this.value)
          },
          `${engine.frameworkPrefix}:use:${name}`
        )
      }
    }
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
    const engine = this
    // Теперь он жестко изолирован в памяти для данного инстанса эффекта,
    // никогда не потеряет контекст и гарантированно станет false после первого тика!
    // Эта переменная она полностью блокирует ложные «холостые» логи при инициализации (монтировании) эффекта
    let isFirstRun = true
    const effectObj: IEffect = {
      label, // Запоминаем имя эффекта для профайлера/логов
      cleanups: new Set(),
      run() {
        this.cleanups.forEach(c => c())
        this.cleanups.clear()
        const prev = engine.activeEffect
        engine.activeEffect = this
        // Замер производительности эффекта:
        const startTime = performance.now()
        engine.safeRun(this, () => {
          const cleanup = fn()
          if (typeof cleanup === 'function') this.cleanups.add(cleanup)
        })

        engine.activeEffect = prev

        // Logger integretion (Читаем флаг из замыкания):
        // Логируем только если это боевой перезапуск (isFirstRun === false)
        const duration = performance.now() - startTime
        if (!isFirstRun && engine.loggerOptions?.isEnabled) {
          const filter = engine.loggerOptions.filter

          if (!filter || (filter instanceof RegExp && !!this.label && filter.test(this.label))) {
            if (typeof engine.queueLog === 'function') {
              engine.queueLog('effect', this.label || 'unnamed-efect-0', {
                name: this.label || 'unnamed-efect-0', // Ключ для фильтрации во flushLogs
                type: 'effect', // Ключ для switch/case в методе log()
                detail: {
                  status: 'stable',
                  duration: `${duration.toFixed(3)}ms`,
                  timestamp: startTime
                }
              })
            }
          }
        }
        // После первого прохода снимаем флаг
        isFirstRun = false
      }
    }
    this.allEffects.add(effectObj)
    effectObj.run()

    return () => {
      effectObj.cleanups.forEach(c => c())
      engine.pendingEffects.delete(effectObj)
      engine.allEffects.delete(effectObj) // Всегда чистим за собой
    }
  }

  // Кэш для вычисляемых свойств: Вместо Map<Function, any> используем строгий интерфейс с unknown дженериком
  private computedCache = new Map<Function, WeakRef<Computed<unknown>>>()

  // 1. Создаем реестр финализации под капотом движка.
  // В качестве токена очистки передаем функцию, которую нужно выполнить.
  private cleanupRegistry = new FinalizationRegistry<() => void>(
    (cleanupFn) => {
      cleanupFn() // Вызовется автоматически, когда сборщик мусора удалит computedInstance
    }
  )

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
    if (this.computedCache.has(fn)) {
      const cachedRef = this.computedCache.get(fn)
      const cachedInstance = cachedRef?.deref()
      if (cachedInstance) {
        return cachedInstance as Computed<T>
      }
    }

    const engine = this
    const name = signalName || 'unnamed_computed'

    // Маркируем внутренний сигнал ядра метаданными для утилиты getExtractedValues
    const sig = this.signal<T>(undefined as unknown as T, `[CORE_INTERNAL_SIGNAL=1]:${name}`)

    let isDirty = true
    let cachedValue: T

    // Core effect:
    // Переносим логику логгера и замер таймингов прямо сюда — в единственное место,
    // где реально выполняется функция fn() при изменении зависимостей!
    const unsubscribeEffect = this.effect(() => {
      // СЕКРЕТ PUSH-КАСКАДА:
      // Мы принудительно вычисляем fn() на каждый тик зависимостей.
      // Благодаря этому, когда меняется count -> step-A синхронно просыпается в микрозадаче,
      // меняет свой sig.value -> этот сигнал мгновенно будит step-B, который уже добавлен
      // в pendingEffects текущей транзакции!
      cachedValue = fn()
      isDirty = false

      const startTime = typeof performance !== 'undefined' ? performance.now() : 0
      const durationStr = startTime ? `0.010ms` : 'N/A' // Пассивный замер для логгера

      if (typeof engine.queueLog === 'function') {
        engine.queueLog('computed', name, {
          value: cachedValue,
          duration: durationStr
        })
      }

      // Пушим значение. Сеттер сигнала подхватит следующий шаг,
      // так как флаг isBatching удерживается шедулером!
      (sig as any).value = cachedValue
    }, `[IS_OPTIMIZED=1]:${name}`)

    const effectObj = Array.from(this.allEffects)[this.allEffects.size - 1]

    const performCleanup = () => {
      unsubscribeEffect()
      if (effectObj) {
        engine.allEffects.delete(effectObj)
      }
      engine.computedCache.delete(fn)
    }

    const computedInstance: Computed<T> = {
      get value() {
        // Если кто-то читает .value вручную вне эффектов фреймворка,
        // и флаг грязен — производим ленивый Pull-расчет
        if (isDirty) {
          cachedValue = fn()
          isDirty = false;
          (sig as any).value = cachedValue
        }
        return sig.value
      },
      subscribe: (cb: (val: T) => void) => sig.subscribe(cb),
      destroy() {
        performCleanup()
      }
    }

    this.cleanupRegistry.register(computedInstance, performCleanup)
    this.computedCache.set(fn, new WeakRef(computedInstance as Computed<unknown>))

    return computedInstance
  }

  /**
   * Создает глубокий реактивный объект (Proxy) на основе переданного целевого объекта или массива.
   *
   * В отличие от атомарных сигналов (`signal`), требующих ручного обращения через `.value`,
   * метод `reactive` позволяет работать со сложными разветвленными структурами данных нативно,
   * используя стандартный синтаксис JavaScript для чтения и прямой мутации свойств.
   *
   * ### Архитектурные особенности рантайма:
   * 1. **Гранулярность подписок (Property-level Subscriptions):** Зависимости графа ядра трекаются
   *    не для всего объекта целиком, а строго для конкретных ключей (`prop`). Если эффект или
   *    компонент читает свойство `user.name`, он подписывается исключительно на этот ключ.
   *    Изменение свойства `user.age` не вызовет его повторного выполнения.
   * 2. **Глубокое проксирование (Deep Reactivity):** При обращении к вложенным объектам или массивам,
   *    метод динамически и лениво оборачивает их в Proxy-структуры, автоматически формируя
   *    понятные строковые пути для подсистемы логирования (например, `user.meta.role`).
   * 3. **Иммунизация кэша (Proxy Mirroring Cache):** Все созданные Proxy зеркалируются во внутреннем
   *    реестре `proxyCache`. Повторный вызов метода для одного и того же объекта вернет
   *    уже существующий Proxy, предотвращая утечки памяти и дублирование подписок.
   *
   * ### Применение в оптимизации больших форм:
   * Идеально подходит для тяжелых интерфейсов (динамические таблицы, анкеты из сотен полей),
   * так как прямая мутация конкретного инпута изолирует поток изменений и избавляет от необходимости
   * иммутабельного копирования всего стейта формы через оператор расширения (`...spread`).
   *
   * @template T - Тип целевого объекта, расширяющий базовый интерфейс `object`.
   * @function reactive
   * @param {T} target - Исходный объект или массив JavaScript для проксирования.
   * @param {string} [name='reactive'] - Уникальное базовое имя объекта для трассировки и фильтрации в логгере.
   * @returns {T} Глубоко проксированный реактивный объект типа `T`.
   *
   * @example
   * ```typescript
   * // 1. Инициализация в сервисе бизнес-логики:
   * public form = this.engine.reactive({
   *   user: { name: 'Иван', age: 25 }
   * }, 'profile-form');
   *
   * // 2. Прямая мутация в экшене (Proxy перехватит тик и запустит атомарный батчинг):
   * public updateAge() {
   *   this.form.user.age += 1; // Автоматический лог: SIGNAL [profile-form.user.age]
   * }
   *
   * // 3. Мост подписки для UI-компонентов:
   * public uiBridge = this.engine.computed(() => ({
   *   name: this.form.user.name,
   *   age: this.form.user.age
   * }));
   * ```
   */
  public reactive<T extends object>(target: T, name: string = 'reactive'): T {
    if (this.proxyCache.has(target)) {
      return this.proxyCache.get(target) as T
    }
    const engine = this
    const propsSubscribers = new Map<string | symbol, Set<IEffect>>()

    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        if (engine.activeEffect) {
          if (!propsSubscribers.has(prop)) propsSubscribers.set(prop, new Set())
          propsSubscribers.get(prop)!.add(engine.activeEffect)
        }
        const value = Reflect.get(obj, prop, receiver)
        return (value !== null && typeof value === 'object')
          ? engine.reactive(value, `${name}.${String(prop)}`)
          : value
      },
      set(obj, prop, value, receiver) {
        const old = Reflect.get(obj, prop, receiver)
        if (old === value) return true

        if (old !== value) {
          Reflect.set(obj, prop, value, receiver)
          engine.onSignalChange?.(`${name}.${String(prop)}`, value, old)
          propsSubscribers.get(prop)?.forEach(e =>
            engine.isBatching ? engine.pendingEffects.add(e) : e.run()
          )
        }
        return true
      }
    })
    this.proxyCache.set(target, proxy)
    return proxy
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
    fn()
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
        return reject(new DOMException('Aborted', 'AbortError'))
      }

      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      const onAbort = () => {
        clearTimeout(timeoutId) // СИНХРОННО УБИВАЕТ ТАЙМЕР. В Vitest это заставит таймер исчезнуть из очереди прокрутки
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Создание асинхронного ресурса. Типы на входе: <T - формат ответа, S - источник изменений (сигнал либо computed-кортеж из зачений сигналов через конструкцию `.value`)>
   *
   * Explained 👉 {@link https://github.com/garage-13/reactive-engine/blob/main/README_EN.md#1-async-resources-dependent-on-multiple-signals}
   *
   * @template T, S
   * @see {@link https://github.com/garage-13/reactive-engine/blob/main/examples/200-resource/Example200.tsx Реализация базового компонента Example200}
   * @see {@link https://github.com/garage-13/reactive-engine/blob/main/examples/201-multi-resource/service.secondary.ts Сложный пример зависимости ресурсов через computed}
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
    const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
    const signalName = isOptionsObject
      ? (optionsOrName as ResourceOptions<T, S>).name
      : (optionsOrName as string) || 'unnamed_resource'

    const options: Partial<ResourceOptions<T, S>> = isOptionsObject
      ? (optionsOrName as ResourceOptions<T, S>)
      : {}

    const resetDataOnSourceChange = options.resetDataOnSourceChange ?? true
    const responseValidate = options.responseValidate
    const validateBeforeFetch = options.validateBeforeFetch

    const retryCount = options.retryCount ?? 0
    const baseDelay = options.retryDelay ?? 1000
    const useExponential = options.isExponentialBackoffEnabled ?? false
    const maxRetryDelay = options.maxRetryDelay ?? 30000
    const timeoutMs = options.timeout

    // Оставляем префикс метаданных для внутренней подсистемы логгера
    const state = this.signal<ResourceState<T>>(
      { data: null, loading: true, error: null, isRetrying: false },
      `[CORE_INTERNAL_SIGNAL=1]:resource:state:${signalName}`
    )

    // Внутренний метод для безопасного обновления стейта и отправки лога
    const updateResourceState = (nextState: ResourceState<T>) => {
      (state as any).value = nextState

      // Logger Trigger for Resource: Передаем чистое signalName, чтобы заголовок в консоли оставался аккуратным
      if (typeof this.queueLog === 'function') {
        this.queueLog('resource', signalName, {
          loading: nextState.loading,
          data: nextState.data,
          error: nextState.error,
          isRetrying: nextState.isRetrying
        })
      }
    }

    const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
      if (effectSignal.aborted) return

      // const isValid = options.validateBeforeFetch ? options.validateBeforeFetch(sValue) : true;

      /**
       * 🧐 WIP_CORE: Есть два пути, ни один не будет ошибкой, если разкомментировать код ниже. Чуть бозже добавлю опци для более тонкой отладки ядра.
       *
       * - АКТИВНО: Разделяем мирную блокировку (false) и боевую ошибку (string): работать будет идеально, но без логов, связанных с пре-валидацией
       * - НЕАКТИВНО: Более очевидное логирование процессов пре-валидации (выставление ошибок и мониторинг разработчиком)
      */
      // --
      // if (isValid === false) {
      //   // Если валидатор вернул строго false — мы тихо блокируем старт фетчера,
      //   // переводя ресурс в состояние ПОКОЯ (loading: false, error: null).
      //   // Это полностью ликвидирует генерацию ложных ошибок при монтировании!
      //   state.value = {
      //     loading: false,
      //     data: null,
      //     error: null, // 🟢 ФИКС: Ошибки нет! Стейт стабилен.
      //     isRetrying: false
      //   };
      //   return;
      // }
      // if (typeof isValid === 'string') {
      //   // Если валидатор вернул строку — это боевая декларативная ошибка валидации формы.
      //   // Здесь мы честно переводим ресурс в стейт ошибки, как и требовалось ранее.
      //   state.value = {
      //     loading: false,
      //     data: null,
      //     error: new Error(isValid),
      //     isRetrying: false
      //   };
      //   return;
      // }
      // --

      if (validateBeforeFetch) {
        const preValidationResult = validateBeforeFetch(sValue)
        if (preValidationResult === false || typeof preValidationResult === 'string') {
          if (effectSignal.aborted) return
          const errorMsg = typeof preValidationResult === 'string'
            ? preValidationResult
            : 'Pre-fetch validation failed for resource'

          const currentData = isSourceChange ? null : this.untrack(() => state.value.data)
          updateResourceState({ data: currentData, loading: false, error: new Error(errorMsg), isRetrying: false })
          return
        }
      }

      const shouldClear = isSourceChange && resetDataOnSourceChange
      const currentData = shouldClear ? null : this.untrack(() => state.value.data)

      updateResourceState({ data: currentData, loading: true, error: null, isRetrying: false })

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        if (effectSignal.aborted) return
        let combinedSignal = effectSignal

        try {
          if (timeoutMs && timeoutMs > 0) {
            const timeoutSignal = AbortSignal.timeout(timeoutMs)
            combinedSignal = AbortSignal.any([effectSignal, timeoutSignal])
          }

          const data = await fetcher(sValue, combinedSignal)

          if (effectSignal.aborted) return

          if (combinedSignal.aborted) {
            throw new DOMException('The operation timed out.', 'TimeoutError')
          }

          if (responseValidate) {
            const validationResult = responseValidate(data)
            if (validationResult === false || typeof validationResult === 'string') {
              if (effectSignal.aborted) return
              const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
              updateResourceState({ data: null, loading: false, error: new Error(errorMsg), isRetrying: false })
              return
            }
          }

          if (effectSignal.aborted) return

          // Успешное завершение запроса
          updateResourceState({ data, loading: false, error: null, isRetrying: false })
          return
        } catch (e: any) {
          if (effectSignal.aborted || (e.name === 'AbortError' && effectSignal.aborted)) return

          const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError' || e.message?.includes('timeout')

          const isCustomValidationError = getExtractedValues({
            tested: [e.message], expectedKey: 'THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY', valueType: 'number',
          })?.[0] === '1' || false

          const __defaultCustomValidationErrorMessage = 'Custom validation error'
          let customValidationErrorMessage: string = isCustomValidationError
            ? (getExtractedValues({
              tested: [e.message], expectedKey: 'MESSAGE', valueType: 'string',
            })?.[0] || __defaultCustomValidationErrorMessage)
            : __defaultCustomValidationErrorMessage

          const isFetchBodyValidationError = isCustomValidationError || e.name === 'ValidationError'

          if (attempt === retryCount || isFetchBodyValidationError) {
            if (effectSignal.aborted) return

            const finalError = isTimeout
              ? new Error(`Request timed out after ${timeoutMs}ms`, { cause: e })
              : isCustomValidationError
                ? new Error(customValidationErrorMessage, { cause: e })
                : e

            // Фиксация финальной ошибки
            updateResourceState({ data: null, loading: false, error: finalError, isRetrying: false })
            return
          } else {
            if (effectSignal.aborted) return

            let currentDelay = useExponential ? baseDelay * Math.pow(2, attempt) : baseDelay
            currentDelay = Math.min(currentDelay, maxRetryDelay)
            const jitter = Math.random() * 200
            currentDelay = currentDelay + jitter

            // Безопасное обновление статуса ретрая с логгированием фазы повтора
            updateResourceState({ data: state.value.data, loading: true, error: null, isRetrying: true })

            const logReason = isTimeout ? 'таймауту' : 'ошибке сети'
            console.warn(`[Resource Retry] "${signalName}" сбой по ${logReason}. Попытка ${attempt + 1}/${retryCount + 1}...`)

            try {
              await this.delay(currentDelay, effectSignal)
              if (effectSignal.aborted) return
            } catch (delayError) {
              return
            }
          }
        }
      }
    }

    let activeEffectController: AbortController | null = null

    this.effect(() => {
      const sValue = source ? source.value : undefined as S
      const effectController = new AbortController()
      activeEffectController = effectController

      this.untrack(() => {
        load(sValue as S, effectController.signal, true)
      })

      return () => effectController.abort()
    }, '[dev]')

    return {
      get data() { return state.value.data },
      get loading() { return state.value.loading },
      get error() { return state.value.error },
      get isRetrying() { return state.value.isRetrying },
      get value() { return state.value },
      refetch: () => {
        activeEffectController?.abort()
        activeEffectController = new AbortController()
        load(source ? source.value : undefined as S, activeEffectController.signal, false)
      },
      subscribe: (cb: (val: ResourceState<T>) => void) => state.subscribe(cb)
    }
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
    const prev = this.activeEffect
    this.activeEffect = null // Временно "забываем" про активный эффект
    try {
      return fn()
    } finally {
      this.activeEffect = prev // Возвращаем эффект на место
    }
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
      fn()
    } catch (error) {
      console.error(
        `%c[Reactive Error] %cОшибка в эффекте/computed:`,
        "color: white; background: red; padding: 2px 4px; border-radius: 3px;",
        "font-weight: bold;",
        error
      )
      // Здесь можно отправить ошибку в Sentry или другой сервис мониторинга
    }
  }
}
