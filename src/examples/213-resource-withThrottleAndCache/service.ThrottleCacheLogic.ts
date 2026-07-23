import { BaseREService } from '../../BaseREService'

interface CombinedOptions {
  limit?: number
  ttl?: number
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Наш комбинированный декоратор
export const withThrottleAndCache = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: CombinedOptions = {}
) => {
  const limit = options.limit ?? 300
  const ttl = options.ttl ?? 5 * 60 * 1000

  let lastExecutionTime = 0
  let throttleTimeoutId: ReturnType<typeof setTimeout> | null = null
  let lastSavedSource: S | null = null
  let lastSavedResolve: ((value: T | PromiseLike<T>) => void) | null = null
  let lastSavedReject: ((reason: any) => void) | null = null
  let lastSavedSignal: AbortSignal | null = null

  const cache = new Map<string, CacheEntry<T>>()

  const getCacheKey = (source: S): string => {
    return typeof source === 'object' && source !== null ? JSON.stringify(source) : String(source)
  }

  return (source: S, signal: AbortSignal): Promise<T> => {
    const now = Date.now()
    const remainingTime = limit - (now - lastExecutionTime)
    const cacheKey = getCacheKey(source)

    const onAbort = () => {
      if (throttleTimeoutId) { clearTimeout(throttleTimeoutId); throttleTimeoutId = null; }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted by signal', 'AbortError'))
        lastSavedResolve = null; lastSavedReject = null;
      }
    }

    const executeWithCache = async (src: S, sig: AbortSignal): Promise<T> => {
      const currentNow = Date.now()
      const currentKey = getCacheKey(src)
      const cached = cache.get(currentKey)

      if (cached && currentNow - cached.timestamp < ttl) {
        return cached.data
      }

      const freshData = await fetcher(src, sig)
      cache.set(currentKey, { data: freshData, timestamp: Date.now() })
      return freshData
    }

    if (remainingTime <= 0) {
      if (throttleTimeoutId) { clearTimeout(throttleTimeoutId); throttleTimeoutId = null; }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted due to newer direct execution', 'AbortError'))
        lastSavedResolve = null; lastSavedReject = null;
      }
      lastExecutionTime = now
      return executeWithCache(source, signal)
    }

    if (lastSavedReject) {
      lastSavedReject(new DOMException('Aborted due to newer throttled value', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      lastSavedSource = source
      lastSavedResolve = resolve
      lastSavedReject = reject
      lastSavedSignal = signal

      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort)

      if (!throttleTimeoutId) {
        throttleTimeoutId = setTimeout(async () => {
          throttleTimeoutId = null
          const savedSource = lastSavedSource!
          const savedResolve = lastSavedResolve!
          const savedReject = lastSavedReject!
          const savedSignal = lastSavedSignal!

          lastSavedSource = null; lastSavedResolve = null; lastSavedReject = null; lastSavedSignal = null;
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

// Сам бизнес-сервис
export class ThrottleCacheLogic extends BaseREService {
  // Дискретные координаты (округляем до 50px, чтобы пользователь мог легко повторно попасть в ту же зону)
  public gridCoords = this.createSignal<{ x: number; y: number }>({ x: 0, y: 0 }, 'grid:signal:coords')

  // Счетчик реальных (физических) вызовов тяжелого фетчера бэкенда
  public fetchCount = this.createSignal<number>(0, 'grid:signal:fetch-count')

  /**
   * Реактивный ресурс с комбо-декоратором
   */
  public gridResource = this.engine.resource(
    withThrottleAndCache(
      async (coords, abortSignal) => {
        // Увеличиваем счетчик реальных обращений
        this.fetchCount.value += 1

        // Тяжелая фейковая операция расчета региона
        await new Promise((resolve) => setTimeout(resolve, 150))
        return `[Сектор: ${coords.x}:${coords.y}] — Данные успешно сгенерированы бэкендом.`
      },
      {
        limit: 400,    // Троттлинг: не чаще одного раза в 400 мс
        ttl: 15 * 1000 // Кэш: храним историю секторов 15 секунд [1]
      }
    ),
    this.gridCoords
  )

  public updateCoords(x: number, y: number) {
    // Округляем до сетки в 50 пикселей, создавая "дискретные зоны" для наглядности кэша
    const gridX = Math.floor(x / 50) * 50
    const gridY = Math.floor(y / 50) * 50

    if (this.gridCoords.value.x !== gridX || this.gridCoords.value.y !== gridY) {
      this.gridCoords.value = { x: gridX, y: gridY }
    }
  }
}
