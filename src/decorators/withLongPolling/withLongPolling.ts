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
 * Адаптированный декоратор лонг-поллинга для engine.resource.
 * Принимает строго два аргумента: асинхронную функцию и конфиг-объект.
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
  } = options;

  let currentErrorDelay = errorInitialDelay;
  let currentSessionToken = 0;

  return (source: S, signal: AbortSignal): Promise<T> => {
    const activeSessionId = ++currentSessionToken;

    return new Promise<T>((resolve, reject) => {

      const poll = async () => {
        if (signal.aborted || externalSignal?.aborted) {
          reject(new DOMException('Aborted by long polling lifecycle', 'AbortError'));
          return;
        }

        try {
          const data = await fetcher(source, signal);
          currentErrorDelay = errorInitialDelay;

          if (signal.aborted || externalSignal?.aborted) {
            reject(new DOMException('Aborted by long polling lifecycle', 'AbortError'));
            return;
          }

          resolve(data);

          setTimeout(() => {
            if (activeSessionId === currentSessionToken && !signal.aborted && !externalSignal?.aborted) {
              onNextTick();
            }
          }, delay);

        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            reject(error);
            return;
          }

          reject(error);
          const delayDuration = currentErrorDelay;

          onError(delayDuration, () => {
            if (activeSessionId === currentSessionToken) {
              currentErrorDelay = Math.min(currentErrorDelay * 2, errorMaxDelay);
            }
          });

          setTimeout(() => {
            if (activeSessionId === currentSessionToken && !signal.aborted && !externalSignal?.aborted) {
              onNextTick();
            }
          }, delayDuration);
        }
      };

      const forceKillTimer = () => {
        reject(new DOMException('Aborted by lifecycle event', 'AbortError'));
      };

      signal.addEventListener('abort', forceKillTimer);
      if (externalSignal) {
        externalSignal.addEventListener('abort', forceKillTimer);
      }

      if (signal.aborted || externalSignal?.aborted) {
        return forceKillTimer();
      }

      poll();
    });
  };
};
