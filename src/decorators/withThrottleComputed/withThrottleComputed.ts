import { ReactiveEngine } from '../../core/core'

interface ThrottleComputedOptions {
  limit: number;
}

/**
 * Обертка-декоратор для создания дросселируемых (throttled) вычисляемых значений.
 * Позволяет сгруппировать и ограничить частоту обновления тяжелых вычислений,
 * защищая граф зависимостей и UI от лавинообразных изменений ("дребезга" данных).
 *
 * ### 🧠 Как это работает под капотом:
 * 1. Функция синхронно считывает `getter()`, чтобы получить стартовое значение.
 * 2. Внутри создается скрытый сигнал `engine.signal<T>` для хранения задросселированного стейта.
 * 3. Регистрируется `engine.effect`, который автоматически собирает все реактивные зависимости
 *    внутри вашего геттера. При изменении любой зависимости эффект запускает таймер на базе `setTimeout`.
 * 4. Значение выдается мгновенно на первом пассе, а последующие изменения зажимаются во временной интервал `options.limit`.
 *
 * @template T Тип вычисляемого значения.
 *
 * @param {ReactiveEngine} engine Экземпляр реактивного ядра, в контексте которого создаются примитивы.
 * @param {() => T} getter Функция-вычислитель, содержащая реактивные сигналы. Зависимости собираются автоматически.
 * @param {Object} options Конфигурация планировщика дросселирования.
 * @param {number} options.limit Временной интервал задержки в миллисекундах (минимальное время между обновлениями).
 * @param {string} [signalName] Необязательное имя для отладки. Будет впечено в системные маркеры логгера.
 *
 * @returns {Object} Возвращает объект интерфейса вычисляемого значения:
 * @returns {T} value Геттер для чтения текущего задросселированного значения (вызывает Pull-обновление).
 * @returns {(cb: (val: T) => void) => () => void} subscribe Метод подписки на изменения значения (для связи с UI слоем).
 * @returns {() => void} destroy Функция принудительной очистки активных таймеров. Обязательна к вызову при уничтожении контекста.
 *
 * @example
 * ```typescript
 * import { withThrottleComputed } from '@pravosleva/reactive-engine';
 *
 * const searchInput = engine.signal('reac', 'search');
 *
 * // Создаем задросселированный компут: будет обновляться не чаще чем раз в 300мс
 * const throttledSearch = withThrottleComputed(
 *   engine,
 *   () => executeHeavySearchFilter(searchInput.value),
 *   { limit: 300 },
 *   'heavy-search'
 * );
 *
 * // Подписываемся на финальный результат
 * throttledSearch.subscribe((finalResult) => {
 *   renderSearchResults(finalResult);
 * });
 *
 * // Не забываем вызвать destroy при анмаунте компонента/сервиса
 * onUnmounted(() => throttledSearch.destroy());
 * ```
 *
 * @abstract
 * ### 🧪 Тестирование с Fake Timers
 * Код функции переведен на нативный `Date.now()`, что обеспечивает 100% совместимость с ложными
 * таймерами в тестовых средах. При написании тестов используйте `vi.advanceTimersByTime(limit)`
 * для контролируемой перемотки времени планировщика.
 */
export const withThrottleComputed = <T>(
  engine: ReactiveEngine,
  getter: () => T,
  options: ThrottleComputedOptions,
  signalName?: string
) => {
  const name = signalName || 'throttled_computed:unnamed'
  const limit = options.limit

  const initialValue = getter()
  const throttledSignal = engine.signal<T>(initialValue, `signal:internal:${name}`)

  // ИСПОЛЬЗУЕМ СТАНДАРТНЫЙ ТАЙМЕР ДЛЯ СИНХРOНИЗАЦИИ С ТЕСТАМИ
  let lastRunTime = 0
  let timeoutId: any = null
  let pendingValue: T | null = null
  let hasPending = false

  let isFirstEffectRun = true

  const updateSignal = (value: T) => {
    throttledSignal.value = value
    lastRunTime = Date.now() // Перешли на Date.now() для 100% поддержки FakeTimers
    hasPending = false
    timeoutId = null
  }

  engine.effect(() => {
    const freshValue = getter() // Собираем зависимости нативно

    if (isFirstEffectRun) {
      isFirstEffectRun = false
      return
    }

    const now = Date.now()

    // Если lastRunTime === 0 — это самое первое реальное изменение, пушим его сразу
    const timePassed = lastRunTime === 0 ? limit : (now - lastRunTime)

    if (timePassed >= limit) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      updateSignal(freshValue)
    } else {
      pendingValue = freshValue
      hasPending = true

      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (hasPending) {
            updateSignal(pendingValue as T)
          }
        }, limit - timePassed)
      }
    }
  }, `effect:throttle-scheduler:${name}`)

  const destroy = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }

  return {
    get value(): T {
      return throttledSignal.value
    },
    subscribe: (cb: (val: T) => void) => throttledSignal.subscribe(cb),
    destroy
  }
}
