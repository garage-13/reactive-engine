interface ThrottleAndCacheOptions {
  /** Интервал троттлинга в миллисекундах. По умолчанию 300 мс */
  limit?: number;
  /** Время жизни кэша в миллисекундах. По умолчанию 5 минут (300000 мс) */
  ttl?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Комбинированный декоратор: сначала применяет троттлинг к частоте вызовов,
 * а затем проверяет кэш перед отправкой реального fetcher-запроса.
 */
export const withThrottleAndCache = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ThrottleAndCacheOptions = {}
) => {
  const limit = options.limit ?? 300
  const ttl = options.ttl ?? 5 * 60 * 1000

  // Инфраструктура троттлинга
  let lastExecutionTime = 0
  let throttleTimeoutId: ReturnType<typeof setTimeout> | null = null
  let lastSavedSource: S | null = null
  let lastSavedResolve: ((value: T | PromiseLike<T>) => void) | null = null
  let lastSavedReject: ((reason: any) => void) | null = null
  let lastSavedSignal: AbortSignal | null = null

  // Инфраструктура кэширования
  const cache = new Map<string, CacheEntry<T>>()

  // Внутренний хелпер для генерации ключа кэша
  const getCacheKey = (source: S): string => {
    return typeof source === 'object' && source !== null
      ? JSON.stringify(source)
      : String(source)
  }

  return (source: S, signal: AbortSignal): Promise<T> => {
    const now = Date.now()
    const remainingTime = limit - (now - lastExecutionTime)
    const cacheKey = getCacheKey(source)

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

    // --- ФУНКЦИЯ ВЫПОЛНЕНИЯ ЗАПРОСА С УЧЕТОМ КЭША ---
    const executeWithCache = async (src: S, sig: AbortSignal): Promise<T> => {
      const currentNow = Date.now()
      const currentKey = getCacheKey(src)
      const cached = cache.get(currentKey)

      // Проверяем оперативную память на валидность кэша
      if (cached && currentNow - cached.timestamp < ttl) {
        return cached.data
      }

      // Если кэша нет — делаем реальный запрос
      const freshData = await fetcher(src, sig)

      // Сохраняем в кэш
      cache.set(currentKey, {
        data: freshData,
        timestamp: Date.now(),
      })

      return freshData
    }

    // --- ВЕТКА 1: Leading edge (Окно блокировки закрыто, выполняем сразу) ---
    if (remainingTime <= 0) {
      if (throttleTimeoutId) {
        clearTimeout(throttleTimeoutId)
        throttleTimeoutId = null
      }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted due to newer direct execution', 'AbortError'))
        lastSavedResolve = null
        lastSavedReject = null
      }

      lastExecutionTime = now
      return executeWithCache(source, signal)
    }

    // --- ВЕТКА 2: Trailing edge (Внутри окна блокировки, перезаписываем хвост) ---
    if (lastSavedReject) {
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

      if (!throttleTimeoutId) {
        throttleTimeoutId = setTimeout(async () => {
          throttleTimeoutId = null

          const savedSource = lastSavedSource!
          const savedResolve = lastSavedResolve!
          const savedReject = lastSavedReject!
          const savedSignal = lastSavedSignal!

          lastSavedSource = null
          lastSavedResolve = null
          lastSavedReject = null
          lastSavedSignal = null
          savedSignal.removeEventListener('abort', onAbort)

          try {
            lastExecutionTime = Date.now()
            const data = await executeWithCache(savedSource, savedSignal)
            savedResolve(data)
          } catch (error) {
            savedReject(error)
          }
        }, remainingTime)
      }
    })
  }
}
