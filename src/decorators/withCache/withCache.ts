interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  /** Время жизни кэша в миллисекундах. По умолчанию 5 минут (300000 мс) */
  ttl?: number;
}

/**
 * Декоратор для создания кэширующего загрузчика данных, специально
 * адаптированный для использования совместно с `engine.resource`.
 *
 * Оборачивает асинхронную функцию `fetcher` в контур кэширования в оперативной памяти (In-Memory Cache).
 * При повторных вызовах с теми же входными параметрами `source` декоратор возвращает сохраненный результат
 * из памяти, если не истекло время жизни записи (TTL), полностью предотвращая избыточные сетевые или дисковые запросы.
 *
 * ### 🧠 Механика кэширования и дедупликации:
 * 1. **Динамическая генерация ключей:** Декоратор автоматически формирует строковый ключ кэша на основе аргумента `source`.
 *    Если в качестве параметров передан сложный объект или массив, применяется `JSON.stringify`, что обеспечивает
 *    глубокое сравнение параметров. Для примитивов используется явное приведение к `String`.
 * 2. **Контроль устаревания (TTL):** Каждая запись в кэше снабжается меткой времени (`timestamp`), которая фиксируется
 *    *после* успешного завершения запроса. При каждом вызове проверяется условие `now - timestamp < ttl`.
 *    Если кэш устарел, он прозрачно перезаписывается свежими данными.
 *
 * @template S Тип входных данных (аргументов) для функции запроса, используемых для генерации ключа кэша.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом (разрешенное значение промиса).
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Оригинальная асинхронная функция запроса, принимающая параметры и сигнал отмены.
 * @param {CacheOptions} [options={}] Параметры конфигурации кэширования.
 * @param {number} [options.ttl=300000] Время жизни кэша (Time-To-Live) в миллисекундах (по умолчанию 5 минут).
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Возвращает обернутую асинхронную функцию, возвращающую `Promise<T>` и полностью сохраняющую исходную сигнатуру типов.
 *
 * @example
 * ```typescript
 * import { withCache } from '@pravosleva/reactive-engine';
 *
 * interface FilterParams { category: string; tags: string[]; }
 *
 * const fetchCategories = async (params: FilterParams, signal: AbortSignal) => {
 *   const res = await fetch(`/api/items?cat=${params.category}&tags=${params.tags.join(',')}`, { signal });
 *   return res.json();
 * };
 *
 * // Кэшируем результаты запросов на 1 минуту. Повторные вызовы с одинаковыми тегами не пойдут в сеть.
 * const cachedFetch = withCache(fetchCategories, { ttl: 60 * 1000 });
 *
 * // Интеграция с подсистемой ресурсов вашего реактивного ядра
 * const directoryResource = engine.resource({
 *   fetcher: cachedFetch,
 *   source: () => currentFilters.value // Следит за сигналом фильтров
 * });
 * ```
 *
 * @abstract
 * ### 🚨 Внимание при работе в SSR (Next.js / Nuxt 3)
 * Поскольку структура кэша `cache = new Map()` объявлена на уровне замыкания декоратора, в среде выполнения
 * на сервере Node.js этот экземпляр кэша будет **общим для всех HTTP-запросов**, если декоратор создан
 * как глобальный синглтон.
 * - Для предотвращения утечек данных между пользователями в SSR-среде создавайте обернутую функцию `withCache`
 *   **строго внутри локального request-scoped контекста** (например, внутри плагинов или компонентов),
 *   либо используйте её исключительно на стороне клиента (CSR).
 *
 * ### 🧪 Совместимость с Fake Timers
 * В коде используется нативный `Date.now()`, что обеспечивает 100% стабильность работы при тестировании
 * кэша через имитацию времени в Vitest / Jest с помощью функций `vi.useFakeTimers()` и `vi.advanceTimersByTime()`.
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
