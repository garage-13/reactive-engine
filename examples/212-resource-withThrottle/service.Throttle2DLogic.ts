import { AbstractService } from '@pravosleva/reactive-engine'

interface ThrottleOptions {
  limit?: number
}

// Наш декоратор троттлинга (wip)
export const withThrottle = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ThrottleOptions = {}
) => {
  const limit = options.limit ?? 300
  let lastExecutionTime = 0
  let throttleTimeoutId: ReturnType<typeof setTimeout> | null = null
  let lastSavedSource: S | null = null
  let lastSavedResolve: ((value: T | PromiseLike<T>) => void) | null = null
  let lastSavedReject: ((reason: any) => void) | null = null
  let lastSavedSignal: AbortSignal | null = null

  return (source: S, signal: AbortSignal): Promise<T> => {
    const now = Date.now()
    const remainingTime = limit - (now - lastExecutionTime)

    const onAbort = () => {
      if (throttleTimeoutId) { clearTimeout(throttleTimeoutId); throttleTimeoutId = null; }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted by signal', 'AbortError'))
        lastSavedResolve = null; lastSavedReject = null;
      }
    }

    if (remainingTime <= 0) {
      if (throttleTimeoutId) { clearTimeout(throttleTimeoutId); throttleTimeoutId = null; }
      if (lastSavedReject) {
        lastSavedReject(new DOMException('Aborted due to newer execution', 'AbortError'))
        lastSavedResolve = null; lastSavedReject = null;
      }
      lastExecutionTime = now
      return fetcher(source, signal)
    }

    if (lastSavedReject) {
      lastSavedReject(new DOMException('Aborted due to newer value', 'AbortError'))
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
            const data = await fetcher(savedSource, savedSignal)
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
export class Throttle2DLogic extends AbstractService {
  // Сигнал, куда записываются сырые координаты X и Y при движении мыши
  public coordsSignal = this.createSignal<{ x: number; y: number }>({ x: 0, y: 0 }, '3d:signal:coords')

  /**
   * Реактивный ресурс, обёрнутый в декоратор withThrottle.
   * Он считывает координаты и выполняет "тяжёлый" фейковый расчёт зон.
   * Троттлинг гарантирует частоту выполнения не чаще 1 раза в 300 мс.
   */
  public analyticsResource = this.engine.resource(
    withThrottle(
      async (coords, abortSignal) => {
        // Имитируем небольшую задержку расчёта (например, обращение к гео-модели)
        await new Promise((resolve) => setTimeout(resolve, 100))

        const sector = coords.x < 200 ? 'Левый сектор' : 'Правый сектор'
        return `Аналитика GPU: [${sector}] для точки X: ${coords.x}, Y: ${coords.y}`
      },
      { limit: 300 } // Лимит троттлинга 300 мс
    ),
    this.coordsSignal
  )

  /**
   * Экшен обновления координат из UI
   */
  public updateCoords(x: number, y: number) {
    this.coordsSignal.value = { x, y }
  }
}
