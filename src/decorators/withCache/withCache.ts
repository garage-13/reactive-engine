interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  /** Время жизни кэша в миллисекундах. По умолчанию 5 минут (300000 мс) */
  ttl?: number;
}

/**
 * Декоратор для создания кэширующего fetcher-а для engine.resource
 * @param fetcher Оригинальная асинхронная функция запроса
 * @param options Настройки кэширования
 * @source
 */
export const withCache = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: CacheOptions = {}
) => {
  const ttl = options.ttl ?? 5 * 60 * 1000 // Дефолтный TTL: 5 минут
  const cache = new Map<string, CacheEntry<T>>()

  return async (source: S, signal: AbortSignal): Promise<T> => {
    // 1. Генерируем уникальный ключ на основе зависимостей (массива или объекта)
    const cacheKey = typeof source === 'object' && source !== null
      ? JSON.stringify(source)
      : String(source)

    const now = Date.now()
    const cached = cache.get(cacheKey)

    // 2. Проверяем, есть ли валидный (не устаревший) кэш
    if (cached && (now - cached.timestamp < ttl)) {
      return cached.data
    }

    // 3. Если кэша нет или он устарел — делаем реальный сетевой запрос
    const freshData = await fetcher(source, signal)

    // 4. Сохраняем свежие данные и метку времени в кэш
    cache.set(cacheKey, {
      data: freshData,
      timestamp: Date.now() // берем актуальное время после завершения запроса
    })

    return freshData
  }
}
