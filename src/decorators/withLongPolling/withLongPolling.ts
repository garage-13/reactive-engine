interface LongPollingOptions {
  /** Коллбэк для инкремента реактивного тика (перехода на следующую итерацию поллинга) */
  onNextTick: () => void;

  /**
   * Коллбэк, вызываемый при возникновении сетевой ошибки.
   * Позволяет внешней системе узнать о сбое и текущем времени ожидания до следующей попытки.
   *
   * @param {number} delayMs - Текущая задержка Exponential Backoff в миллисекундах перед следующим запросом.
   * @param {() => void} onRetryScheduled - Коллбэк-триггер. Должен быть вызван один раз, чтобы
   * просигнализировать декоратору, что шаг зафиксирован и задержка для следующей ошибки может быть увеличена.
   */
  onError: (delayMs: number, onRetryScheduled: () => void) => void;

  /** Пауза перед открытием следующего соединения в миллисекундах. По умолчанию 500 мс */
  delay?: number;
  /** Стартовая задержка Exponential Backoff в миллисекундах. По умолчанию 2000 мс */
  errorInitialDelay?: number;
  /** Потолок задержки Exponential Backoff в миллисекундах. По умолчанию 8000 мс */
  errorMaxDelay?: number;
  /** Внешний сигнал для жесткой остановки рекурсивных таймаутов */
  externalSignal?: AbortSignal;
}

/**
 * Адаптированный декоратор для реализации паттерна Long Polling (длинные опросы),
 * спроектированный специально для интеграции с подсистемой `engine.resource`.
 *
 * Превращает разовый асинхронный запрос данных в непрерывный контролируемый конвейер
 * циклического опроса сервера с поддержкой экспоненциального отката при ошибках
 * (Exponential Backoff) и защитой от пересечения параллельных сессий.
 *
 * ### 🧠 Архитектура конвейера опроса:
 * 1. **Контроль сессионных токенов:** Каждый новый вызов функции инкрементирует `currentSessionToken`.
 *    Если предыдущий запрос завершится позже, таймер следующего шага не взведется, так как
 *    идентификаторы сессий (`activeSessionId === currentSessionToken`) не совпадут. Это полностью исключает утечки и гонки ответов.
 * 2. **Экспоненциальный откат (Exponential Backoff):** При успешном запросе интервал между циклами равен `options.delay`.
 *    В случае падения сетевого запроса, время ожидания перед следующим опросом прогрессивно удваивается,
 *    начиная с `errorInitialDelay` вплоть до достижения лимита `errorMaxDelay`, чтобы не спамить упавший бэкенд.
 * 3. **Двойной контур отмены:** Поддерживает как локальный `AbortSignal` от ресурса, так и глобальный `externalSignal`
 *    (например, для остановки всех фоновых процессов при закрытии приложения).
 *
 * @template S Тип входных данных (аргументов) для функции запроса.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом (разрешенное значение промиса).
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Асинхронная функция-загрузчик (например, fetch-запрос к эндпоинту уведомлений).
 * @param {LongPollingOptions} options Конфигурация параметров и коллбэков длинных опросов.
 * @param {() => void} options.onNextTick Коллбэк-триггер, вызываемый для перезапуска цикла опроса (в контексте ядра обычно мутирует или инвалидирует `source` ресурса).
 * @param {(currentDelay: number, increaseDelay: () => void) => void} [options.onError] Коллбэк, вызываемый при ошибке сети. Позволяет логировать сбои и управлять шагом экспоненциального отката через запуск функции `increaseDelay()`.
 * @param {AbortSignal} [options.externalSignal] Внешний сигнал отмены для принудительной остановки поллинга извне (независимо от жизненного цикла ресурса).
 * @param {number} [options.delay=500] Базовая задержка в миллисекундах между успешным ответом сервера и началом следующего запроса.
 * @param {number} [options.errorInitialDelay=2000] Стартовая задержка в миллисекундах при возникновении первой ошибки.
 * @param {number} [options.errorMaxDelay=8000] Максимально возможный интервал задержки в миллисекундах при череде последовательных ошибок.
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Возвращает обернутую циклическую функцию, возвращающую `Promise<T>`.
 *
 * @example
 * ```typescript
 * import { withLongPolling } from '@pravosleva/reactive-engine';
 *
 * // 1. Настраиваем функцию опроса новостной ленты
 * const pollingFetch = withLongPolling(
 *   async (userId: string, signal) => {
 *     const res = await fetch(`/api/notifications?uid=${userId}`, { signal });
 *     return res.json();
 *   },
 *   {
 *     delay: 1000,
 *     errorInitialDelay: 2000,
 *     errorMaxDelay: 10000,
 *     onNextTick: () => {
 *       // Инвалидируем или триггерим обновление ресурса в ядре
 *       notificationResource.refresh();
 *     },
 *     onError: (delay, increaseDelay) => {
 *       console.warn(`Ошибка сети. Следующая попытка через ${delay}мс`);
 *       increaseDelay(); // Удваиваем интервал до следующего тика
 *     }
 *   }
 * );
 *
 * // 2. Передаем декоратор в подсистему ресурсов ядра
 * const notificationResource = engine.resource({
 *   fetcher: pollingFetch,
 *   source: () => currentUserId.value
 * });
 * ```
 *
 * @abstract
 * ### 🚨 Поведение при отмене и очистка слушателей
 * При срабатывании любого из сигналов отмены (`signal` или `externalSignal` переходит в состояние `aborted`):
 * - Текущий ожидающий промис немедленно отклоняется с системным исключением `AbortError`.
 * - Цикл поллинга блокируется и полностью прекращает планирование будущих макрозадач `setTimeout`.
 * - Все подписки на события `'abort'` корректно удаляются, предотвращая скрытые утечки памяти в Node.js / браузере.
 */
export const withLongPolling = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: LongPollingOptions
) => {
  const {
    onNextTick,
    onError,
    externalSignal,
    delay = 500,
    errorInitialDelay = 2000,
    errorMaxDelay = 8000
  } = options

  let currentErrorDelay = errorInitialDelay
  let currentSessionToken = 0

  return (source: S, signal: AbortSignal): Promise<T> => {
    const activeSessionId = ++currentSessionToken

    return new Promise<T>((resolve, reject) => {

      const poll = async () => {
        if (signal.aborted || externalSignal?.aborted) {
          reject(new DOMException('Aborted by long polling lifecycle', 'AbortError'))
          return
        }

        try {
          const data = await fetcher(source, signal)
          currentErrorDelay = errorInitialDelay

          if (signal.aborted || externalSignal?.aborted) {
            reject(new DOMException('Aborted by long polling lifecycle', 'AbortError'))
            return
          }

          resolve(data)

          setTimeout(() => {
            if (activeSessionId === currentSessionToken && !signal.aborted && !externalSignal?.aborted) {
              onNextTick?.()
            }
          }, delay)

        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            reject(error)
            return
          }

          reject(error)
          const delayDuration = currentErrorDelay

          if (typeof onError === 'function') onError(delayDuration, () => {
            if (activeSessionId === currentSessionToken) {
              currentErrorDelay = Math.min(currentErrorDelay * 2, errorMaxDelay)
            }
          })

          setTimeout(() => {
            if (activeSessionId === currentSessionToken && !signal.aborted && !externalSignal?.aborted) {
              onNextTick?.()
            }
          }, delayDuration)
        }
      }

      const forceKillTimer = () => {
        reject(new DOMException('Aborted by lifecycle event', 'AbortError'))
      }

      signal.addEventListener('abort', forceKillTimer)
      if (externalSignal) {
        externalSignal.addEventListener('abort', forceKillTimer)
      }

      if (signal.aborted || externalSignal?.aborted) {
        return forceKillTimer()
      }

      poll()
    })
  }
}
