interface DebounceOptions {
  /** Задержка в миллисекундах. По умолчанию 300 мс */
  delay?: number;
}

/**
 * Декоратор для создания дебаунсящего fetcher-а для engine.resource
 * @param fetcher Оригинальная асинхронная функция запроса
 * @param options Настройки дебаунса
 */
export const withDebounce = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: DebounceOptions = {}
) => {
  const delay = options.delay ?? 300

  // Храним ссылку на активный таймер текущего ожидания
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  // Храним функцию отмены для предыдущего неоконченного промиса ожидания
  let rejectPrevious: ((reason: any) => void) | null = null

  return (source: S, signal: AbortSignal): Promise<T> => {
    // 1. Если уже идет ожидание другого запроса — отменяем его промис и очищаем таймер
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    if (rejectPrevious) {
      // Бросаем DOMException, имитируя нативную отмену fetch, чтобы движок понял, что запрос прерван
      rejectPrevious(new DOMException('Aborted due to debounce', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      // Сохраняем ссылку на reject текущего промиса, чтобы его мог отменить следующий вызов
      rejectPrevious = reject

      // 2. Слушаем нативный AbortSignal от движка (например, если компонент размонтировался во время дебаунса)
      const onAbort = () => {
        if (timeoutId) clearTimeout(timeoutId)
        reject(new DOMException('Aborted by resource signal', 'AbortError'))
      }

      if (signal.aborted) {
        return onAbort()
      }
      signal.addEventListener('abort', onAbort)

      // 3. Взводим отложенный таймер выполнения
      timeoutId = setTimeout(async () => {
        // Убираем слушатель, так как таймаут успешно дождался конца
        signal.removeEventListener('abort', onAbort)
        rejectPrevious = null
        timeoutId = null

        try {
          // 4. Запускаем оригинальный fetcher
          const data = await fetcher(source, signal)
          resolve(data)
        } catch (error) {
          reject(error)
        }
      }, delay)
    })
  }
}
