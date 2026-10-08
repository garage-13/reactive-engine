interface StaleOptions<T> {
  initialData?: T;
  isLogsEnabled?: boolean;
  /**
   * Время жизни кэша в миллисекундах (Time-To-Live).
   * Если текущий запрос упал ИЛИ был отменен, декоратор вернет `stale`-данные
   * для конкретного source только если они были получены в пределах этого интервала.
   */
  ttl?: number;
}

/**
 * Декоратор для сохранения предыдущего успешного состояния данных (Failover Cache) с поддержкой TTL.
 */
export const withStaleWhileRevalidate = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: StaleOptions<T> = {}
) => {
  // Структурная мапа кэша: сериализованный JSON-строка ключа (source) -> { data: T, savedTime: number }
  const cacheMap = new Map<string, { data: T; savedTime: number }>()

  const isLogsEnabled = options.isLogsEnabled ?? false
  const ttl = options.ttl

  // Если переданы начальные данные initialData, заносим их под дефолтным пустым ключом
  if (options.initialData !== undefined) {
    cacheMap.set('__initial__', { data: options.initialData, savedTime: Date.now() })
  }

  // Внутренний хелпер для безопасной сериализации ключей (защита от круговых ссылок)
  const getCacheKey = (source: S): string => {
    try {
      return JSON.stringify(source)
    } catch (e) {
      return String(source)
    }
  }

  return async (source: S, signal: AbortSignal): Promise<T> => {
    const cacheKey = getCacheKey(source)

    // Ищем кэш конкретно под текущий сериализованный слепок параметров!
    let cachedRecord = cacheMap.get(cacheKey) || cacheMap.get('__initial__')

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
      // Выполняем реальный сетевой запрос
      const freshData = await fetcher(source, signal)

      // Запоминаем успешный результат строго под его индивидуальным ключом параметров!
      cacheMap.set(cacheKey, { data: freshData, savedTime: Date.now() })

      // Удаляем временный initialData ключ после первого успешного наполнения реального кэша
      cacheMap.delete('__initial__')

      return freshData
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'

      // Возвращаем старые данные ТОЛЬКО если они подходят под этот конкретный source по параметрам!
      if (isCacheValid() && cachedRecord) {
        if (isLogsEnabled) {
          console.warn(
            `[ReactiveEngine:Stale] Запрос для ключа ${cacheKey} ${isAbort ? 'отменен' : 'упал'}. Отдаем сохраненное состояние.`,
            error
          )
        }
        return cachedRecord.data
      }

      throw error
    }
  }
}
