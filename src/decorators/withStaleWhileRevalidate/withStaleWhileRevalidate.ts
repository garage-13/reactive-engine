export interface StaleOptions<T> {
  ttl?: number;
  isLogsEnabled?: boolean;
  maxSize?: number;
}

export const withStaleWhileRevalidate = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: StaleOptions<T> = {}
) => {
  const cacheMap = new Map<string, { data: T; savedTime: number }>()
  const isLogsEnabled = options.isLogsEnabled ?? false
  const ttl = options.ttl
  const maxSize = options.maxSize

  // Кэшируем флаг, чтобы не проверять "undefined" в горячем цикле
  const hasMaxLimit = maxSize !== undefined && maxSize > 0

  const getCacheKey = (source: S): string => {
    try { return JSON.stringify(source) } catch (e) { return String(source) }
  }

  return async (source: S, signal: AbortSignal): Promise<T> => {
    const cacheKey = getCacheKey(source)
    let cachedRecord = cacheMap.get(cacheKey)

    // ⚡ ОПТИМИЗАЦИЯ #1 (Fast Path): Перестраиваем Map только если включено ограничение памяти
    if (cachedRecord && hasMaxLimit) {
      cacheMap.delete(cacheKey)
      cacheMap.set(cacheKey, cachedRecord)
    }

    const isCacheValid = (): boolean => {
      if (!cachedRecord) return false
      if (ttl === undefined) return true
      return Date.now() - cachedRecord.savedTime < ttl
    }

    if (signal.aborted) {
      if (isCacheValid() && cachedRecord) return cachedRecord.data
      throw signal.reason || new DOMException('The operation was aborted.', 'AbortError')
    }

    try {
      const freshData = await fetcher(source, signal)

      // ⚡ ОПТИМИЗАЦИЯ #2: Итератор `.keys()` вызывается СТРОГО при реальном переполнении
      if (hasMaxLimit && cacheMap.size >= maxSize && !cacheMap.has(cacheKey)) {
        const oldestKey = cacheMap.keys().next().value
        if (oldestKey !== undefined) {
          cacheMap.delete(oldestKey)
          if (isLogsEnabled) {
            console.warn(`[ReactiveEngine:Stale] Кэш переполнен. Удален старый ключ: ${oldestKey}`)
          }
        }
      }

      cacheMap.set(cacheKey, {
        data: freshData,
        savedTime: Date.now()
      })

      return freshData
    } catch (error) {
      if (isCacheValid() && cachedRecord) {
        if (isLogsEnabled) {
          console.warn(`[ReactiveEngine:Stale] Запрос ${cacheKey} упал. Отдаем кэш.`, error)
        }
        return cachedRecord.data
      }

      throw error
    }
  }
}
