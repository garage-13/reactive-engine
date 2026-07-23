interface ThrottleOptions {
  /** Интервал троттлинга в миллисекундах. По умолчанию 300 мс */
  limit?: number;
}

/**
 * Декоратор для создания троттлящего fetcher-а для engine.resource
 * @param fetcher Оригинальная асинхронная функция запроса
 * @param options Настройки троттлинга
 */
export const withThrottle = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ThrottleOptions = {}
) => {
  const limit = options.limit ?? 300;

  let lastExecutionTime = 0;
  let throttleTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Храним параметры последнего "заблокированного" вызова, чтобы выполнить его на хвосте
  let lastSavedSource: S | null = null;
  let lastSavedResolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let lastSavedReject: ((reason: any) => void) | null = null;
  let lastSavedSignal: AbortSignal | null = null;

  return (source: S, signal: AbortSignal): Promise<T> => {
    const now = Date.now();
    const remainingTime = limit - (now - lastExecutionTime);

    // Слушатель для мгновенной отмены ожидания, если ресурс размонтировался во время блокировки
    const onAbort = () => {
      if (throttleTimeoutId) {
        clearTimeout(throttleTimeoutId);
        throttleTimeoutId = null;
      }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted by resource signal during throttle', 'AbortError'));
        lastSavedResolve = null;
        lastSavedReject = null;
      }
    };

    // СЦЕНАРИЙ 1: Интервал блокировки истек — выполняем запрос мгновенно (Leading edge)
    if (remainingTime <= 0) {
      // Если висел отложенный хвостовой вызов, отменяем его, так как пришел более свежий прямой запрос
      if (throttleTimeoutId) {
        clearTimeout(throttleTimeoutId);
        throttleTimeoutId = null;
      }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted due to newer direct throttle execution', 'AbortError'));
        lastSavedResolve = null;
        lastSavedReject = null;
      }

      lastExecutionTime = now;
      return fetcher(source, signal);
    }

    // СЦЕНАРИЙ 2: Мы находимся внутри интервала блокировки.
    // Запоминаем текущие параметры как самые актуальные для выполнения на хвосте (Trailing edge).
    if (lastSavedReject) {
      // Отклоняем предыдущий сохраненный хвостовой промис, так как данные уже устарели
      lastSavedReject(new DOMException('Aborted due to newer throttled value', 'AbortError'));
    }

    return new Promise<T>((resolve, reject) => {
      lastSavedSource = source;
      lastSavedResolve = resolve;
      lastSavedReject = reject;
      lastSavedSignal = signal;

      if (signal.aborted) {
        return onAbort();
      }
      signal.addEventListener('abort', onAbort);

      // Если таймер хвостового вызова еще не запущен, взводим его на остаток времени блокировки
      if (!throttleTimeoutId) {
        throttleTimeoutId = setTimeout(async () => {
          throttleTimeoutId = null;

          const savedSource = lastSavedSource!;
          const savedResolve = lastSavedResolve!;
          const savedReject = lastSavedReject!;
          const savedSignal = lastSavedSignal!;

          // Очищаем ссылки перед асинхронным вызовом
          lastSavedSource = null;
          lastSavedResolve = null;
          lastSavedReject = null;
          lastSavedSignal = null;
          savedSignal.removeEventListener('abort', onAbort);

          try {
            lastExecutionTime = Date.now();
            const data = await fetcher(savedSource, savedSignal);
            savedResolve(data);
          } catch (error) {
            savedReject(error);
          }
        }, remainingTime);
      }
    });
  };
};
