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
 * Комбинированный декоратор высокой производительности: применяет ограничение частоты вызовов (Throttling)
 * с сохранением последнего вызова (Trailing edge) и проверяет валидность кэша в оперативной памяти
 * перед отправкой реального сетевого запроса.
 *
 * Нативно поддерживает отмену операций через стандартный `AbortSignal` на всех этапах жизненного цикла.
 *
 * ### 🧠 Алгоритм работы (Два контура защиты):
 * 1. **Контур Троттлинга:** Если функция вызывается чаще чем раз в `limit` миллисекунд,
 *    вызовы группируются. Первый вызов выполняется мгновенно (Leading edge), а все последующие
 *    внутри окна блокировки перезаписывают друг друга. Выполнится только самый последний вызов (Trailing edge)
 *    по истечении таймера. Все промежуточные отброшенные вызовы отклоняются с ошибкой `AbortError`.
 * 2. **Контур Кэширования:** Когда таймер троттлинга истекает и наступает время реального выполнения,
 *    функция генерирует строковый ключ на основе аргумента `source` (через `JSON.stringify` для объектов).
 *    Если в кэше есть свежий результат, чей возраст меньше `ttl`, он возвращается мгновенно **без**
 *    повторного вызова исходного `fetcher`-запроса.
 *
 * @template S Тип входных данных (аргументов) для запроса. Используется для генерации ключа кэша.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом (разрешенное значение промиса).
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Асинхронная функция-загрузчик, выполняющая реальный сетевой или дисковый запрос.
 * @param {ThrottleAndCacheOptions} [options={}] Параметры конфигурации декоратора.
 * @param {number} [options.limit=300] Окно троттлинга в миллисекундах (минимальный интервал между прямыми вызовами).
 * @param {number} [options.ttl=300000] Время жизни кэша (Time-To-Live) в миллисекундах (по умолчанию 5 минут).
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Возвращает обернутую функцию, которая возвращает `Promise<T>`.
 *
 * @example
 * ```typescript
 * import { withThrottleAndCache } from '@pravosleva/reactive-engine';
 *
 * interface SearchQuery { query: string; page: number; }
 * interface SearchResult { items: string[]; total: number; }
 *
 * const fetchApi = async (search: SearchQuery, signal: AbortSignal): Promise<SearchResult> => {
 *   const response = await fetch(`/api/search?q=${search.query}&p=${search.page}`, { signal });
 *   return response.json();
 * };
 *
 * // Создаем оптимизированную функцию поиска
 * const optimizedSearch = withThrottleAndCache(fetchApi, { limit: 500, ttl: 60 * 1000 });
 *
 * // Пример вызова внутри реактивного эффекта
 * const controller = new AbortController();
 *
 * optimizedSearch({ query: 'react', page: 1 }, controller.signal)
 *   .then(data => updateUi(data))
 *   .catch(err => {
 *     if (err.name === 'AbortError') console.log('Запрос отменен троттлером или пользователем');
 *   });
 * ```
 *
 * @abstract
 * ### 🚨 Интеграция с AbortSignal и управление памятью
 * Декоратор имеет встроенный обработчик события `abort`. Если пользователь отменяет операцию
 * (например, уходит со страницы) во время ожидания в окне троттлинга:
 * - Активный таймер `setTimeout` сбрасывается и зануляется.
 * - Ожидающий промис немедленно переходит в состояние `rejected` с ошибкой `AbortError`.
 * - Все внутренние ссылки на `source` и методы разрешения промиса очищаются (`null`), предотвращая утечки памяти в замыканиях.
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
