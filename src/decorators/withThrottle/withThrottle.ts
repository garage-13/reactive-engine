interface ThrottleOptions {
  /** Интервал троттлинга в миллисекундах. По умолчанию 300 мс */
  limit?: number;
}

/**
 * Декоратор для создания дросселирующего (throttled) загрузчика данных, специально
 * адаптированный для использования совместно с `engine.resource`.
 *
 * Ограничивает частоту вызовов асинхронной функции `fetcher`, гарантируя выполнение
 * первого запроса мгновенно (Leading edge), а самого последнего запроса — на хвосте
 * временного интервала (Trailing edge) с автоматической отменой всех промежуточных вызовов.
 *
 * ### 🧠 Механика обработки вызовов (Две фазы):
 * 1. **Прямое выполнение (Leading edge):** Если окно блокировки закрыто (`remainingTime <= 0`),
 *    запрос пробрасывается к исходному `fetcher` немедленно. Время последнего выполнения фиксируется.
 * 2. **Отложенное выполнение (Trailing edge):** Если вызов происходит внутри активного окна блокировки,
 *    его параметры (`source`, `signal`, `resolve`, `reject`) запоминаются, перезаписывая предыдущие.
 *    По истечении таймера выполнится только самый актуальный (последний) запрос.
 *    Все промежуточные «перезаписанные» промисы отклоняются с ошибкой `AbortError`.
 *
 * @template S Тип входных данных (аргументов) для функции запроса.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом (разрешенное значение промиса).
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Оригинальная асинхронная функция запроса, принимающая параметры и сигнал отмены.
 * @param {ThrottleOptions} [options={}] Параметры конфигурации троттлинга.
 * @param {number} [options.limit=300] Минимальный интервал времени в миллисекундах между последовательными прямыми вызовами.
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Возвращает обернутую функцию, возвращающую `Promise<T>` и полностью сохраняющую исходную сигнатуру типов.
 *
 * @example
 * ```typescript
 * import { withThrottle } from '@pravosleva/reactive-engine';
 *
 * const fetchUserData = async (userId: string, signal: AbortSignal) => {
 *   const res = await fetch(`/api/users/${userId}`, { signal });
 *   return res.json();
 * };
 *
 * // Ограничиваем частоту запросов профиля до 1 раза в 400мс
 * const throttledFetch = withThrottle(fetchUserData, { limit: 400 });
 *
 * // Интеграция с подсистемой ресурсов вашего ядра
 * const userResource = engine.resource({
 *   fetcher: throttledFetch,
 *   source: () => currentUserId.value
 * });
 * ```
 *
 * @abstract
 * ### 🚨 Интеграция с AbortSignal и защита от утечек памяти
 * Декоратор подписывается на событие отмены `abort` переданного сигнала. Если внешний ресурс
 * размонтируется или перезапрашивает данные в процессе ожидания внутри окна троттлинга:
 * - Активный таймер `setTimeout` незамедлительно сбрасывается.
 * - Ожидающий хвостовой промис переходит в состояние `rejected` с системной ошибкой `AbortError`.
 * - Все внутренние ссылки на контекст промиса (`resolve`, `reject`, `source`) принудительно зануляются (`null`),
 *   освобождая память от скрытых замыканий и предотвращая появление эффекта «зависших» запросов.
 */
export const withThrottle = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ThrottleOptions = {}
) => {
  const limit = options.limit ?? 300

  let lastExecutionTime = 0
  let throttleTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Храним параметры последнего "заблокированного" вызова, чтобы выполнить его на хвосте
  let lastSavedSource: S | null = null
  let lastSavedResolve: ((value: T | PromiseLike<T>) => void) | null = null
  let lastSavedReject: ((reason: any) => void) | null = null
  let lastSavedSignal: AbortSignal | null = null

  return (source: S, signal: AbortSignal): Promise<T> => {
    const now = Date.now()
    const remainingTime = limit - (now - lastExecutionTime)

    // Слушатель для мгновенной отмены ожидания, если ресурс размонтировался во время блокировки
    const onAbort = () => {
      if (throttleTimeoutId) {
        clearTimeout(throttleTimeoutId)
        throttleTimeoutId = null
      }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted by resource signal during throttle', 'AbortError'))
        lastSavedResolve = null
        lastSavedReject = null
      }
    }

    // СЦЕНАРИЙ 1: Интервал блокировки истек — выполняем запрос мгновенно (Leading edge)
    if (remainingTime <= 0) {
      // Если висел отложенный хвостовой вызов, отменяем его, так как пришел более свежий прямой запрос
      if (throttleTimeoutId) {
        clearTimeout(throttleTimeoutId)
        throttleTimeoutId = null
      }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted due to newer direct throttle execution', 'AbortError'))
        lastSavedResolve = null
        lastSavedReject = null
      }

      lastExecutionTime = now
      return fetcher(source, signal)
    }

    // СЦЕНАРИЙ 2: Мы находимся внутри интервала блокировки.
    // Запоминаем текущие параметры как самые актуальные для выполнения на хвосте (Trailing edge).
    if (lastSavedReject) {
      // Отклоняем предыдущий сохраненный хвостовой промис, так как данные уже устарели
      lastSavedReject(new DOMException('Aborted due to newer throttled value', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      lastSavedSource = source
      lastSavedResolve = resolve
      lastSavedReject = reject
      lastSavedSignal = signal

      if (signal.aborted) {
        return onAbort()
      }
      signal.addEventListener('abort', onAbort)

      // Если таймер хвостового вызова еще не запущен, взводим его на остаток времени блокировки
      if (!throttleTimeoutId) {
        throttleTimeoutId = setTimeout(async () => {
          throttleTimeoutId = null

          const savedSource = lastSavedSource!
          const savedResolve = lastSavedResolve!
          const savedReject = lastSavedReject!
          const savedSignal = lastSavedSignal!

          // Очищаем ссылки перед асинхронным вызовом
          lastSavedSource = null
          lastSavedResolve = null
          lastSavedReject = null
          lastSavedSignal = null
          savedSignal.removeEventListener('abort', onAbort)

          try {
            lastExecutionTime = Date.now()
            const data = await fetcher(savedSource, savedSignal)
            savedResolve(data)
          } catch (error) {
            savedReject(error)
          }
        }, remainingTime)
      }
    })
  }
}
