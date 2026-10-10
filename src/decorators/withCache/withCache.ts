import { CacheOptions, CacheEntry } from './types'

/**
 * 📦 DECORATOR: withCache (v1.9.0)
 *
 * Продвинутый декоратор кэширования асинхронных фабрик и фетчеров.
 * Нативно предотвращает Race Conditions и дублирование параллельных запросов (Request Collapsing).
 */
export const withCache = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: CacheOptions = {}
) => {
  const ttl = options.ttl ?? 5 * 60 * 1000 // Дефолтный TTL: 5 минут

  // Хранилище готовых данных
  const dataCache = new Map<string, CacheEntry<T>>()
  // Хранилище активных Promise для склеивания параллельного спама!
  const activePromises = new Map<string, Promise<T>>()

  return (source: S, signal: AbortSignal): Promise<T> => {
    // 1. Генерируем детерминированный ключ кэша
    const cacheKey = typeof source === 'object' && source !== null
      ? JSON.stringify(source)
      : String(source)

    // Если AbortSignal уже отменен на старте — мгновенно прерываем цепочку
    if (signal.aborted) {
      return Promise.reject(signal.reason || new Error('Aborted'))
    }

    const now = Date.now()
    const cached = dataCache.get(cacheKey)

    // 2. СЦЕНАРИЙ А: Есть валидный, не устаревший кэш данных
    if (cached && (now - cached.timestamp < ttl)) {
      return Promise.resolve(cached.data)
    }

    // 3. СЦЕНАРИЙ Б: Запрос с таким ключом ПРЯМО СЕЙЧАС идет в сеть (Request Collapsing)
    // Вместо запуска второго фетчера, отдаем тот же самый Promise текущего такта!
    if (activePromises.has(cacheKey)) {
      const existingPromise = activePromises.get(cacheKey)!

      // Навешиваем слушатель отмены текущего сигнала на общий Promise
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason || new Error('Aborted'))
        signal.addEventListener('abort', onAbort)

        existingPromise
          .then(resolve)
          .catch(reject)
          .finally(() => signal.removeEventListener('abort', onAbort))
      })
    }

    // 4. СЦЕНАРИЙ В: Кэша нет или он устарел — инициируем новую транзакцию
    const promise = fetcher(source, signal)
    activePromises.set(cacheKey, promise)

    const executionPromise = new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        activePromises.delete(cacheKey)
        reject(signal.reason || new Error('Aborted'))
      }
      signal.addEventListener('abort', onAbort)

      promise
        .then((freshData) => {
          // Сохраняем завершенные данные и метку времени в кэш
          dataCache.set(cacheKey, {
            data: freshData,
            timestamp: Date.now()
          })
          resolve(freshData)
        })
        .catch((err) => {
          reject(err)
        })
        .finally(() => {
          // Чистим активный промис, открывая дорогу для последующих TTL-обновлений
          activePromises.delete(cacheKey)
          signal.removeEventListener('abort', onAbort)
        })
    })

    return executionPromise
  }
}
