import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withLongPolling } from './withLongPolling'
import { ReactiveEngine } from '../../core/core'

describe('withLongPolling decorator (v2 Options API with on* prefix)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('должен успешно выполнить запрос и вызвать onNextTick через указанный delay', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('success-data')
    const mockNextTick = vi.fn()
    const mockStartBackoff = vi.fn()
    const controller = new AbortController()

    const pollingFetcher = withLongPolling(mockFetcher, {
      onNextTick: mockNextTick,
      onError: mockStartBackoff,
      delay: 500
    })

    const promise = pollingFetcher('source-val', controller.signal)
    await vi.advanceTimersByTimeAsync(0)
    const result = await promise
    expect(result).toBe('success-data')

    await vi.advanceTimersByTimeAsync(499)
    expect(mockNextTick).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockNextTick).toHaveBeenCalledTimes(1)
  })

  it('должен активировать Backoff при ошибке и вызвать onNextTick через errorInitialDelay', async () => {
    const mockFetcher = vi.fn().mockImplementation(() => Promise.reject(new Error('502 Bad Gateway')))
    const mockNextTick = vi.fn()
    const mockStartBackoff = vi.fn().mockImplementation((ms, onComplete) => {
      onComplete()
    })
    const controller = new AbortController()

    const pollingFetcher = withLongPolling(mockFetcher, {
      onNextTick: mockNextTick,
      onError: mockStartBackoff,
      errorInitialDelay: 2000
    })

    const promise = pollingFetcher('source-val', controller.signal)
    promise.catch(() => { })

    await vi.advanceTimersByTimeAsync(0)

    try {
      await promise
    } catch (e: any) {
      expect(e.message).toBe('502 Bad Gateway')
    }

    expect(mockStartBackoff).toHaveBeenCalledWith(2000, expect.any(Function))

    await vi.advanceTimersByTimeAsync(1999)
    expect(mockNextTick).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockNextTick).toHaveBeenCalledTimes(1)
  })

  it('должен самоликвидировать старые таймауты ошибок, если токен сессии изменился', async () => {
    let callCount = 0
    const mockFetcher = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('502'))
      return Promise.resolve('fresh-data')
    })

    const mockNextTick = vi.fn()
    const mockStartBackoff = vi.fn()
    const controller = new AbortController()

    const pollingFetcher = withLongPolling(mockFetcher, {
      onNextTick: mockNextTick,
      onError: mockStartBackoff,
      delay: 500,
      errorInitialDelay: 2000
    })

    const promise1 = pollingFetcher('source-val', controller.signal)
    promise1.catch(() => { })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)

    const promise2 = pollingFetcher('source-val', controller.signal)
    await vi.advanceTimersByTimeAsync(0)
    await promise2

    await vi.advanceTimersByTimeAsync(500)
    expect(mockNextTick).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockNextTick).toHaveBeenCalledTimes(1)
  })

  it('должен мгновенно оборвать транзакцию и не взводить таймауты при срабатывании AbortSignal', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('data')
    const mockNextTick = vi.fn()
    const mockStartBackoff = vi.fn()
    const controller = new AbortController()

    const pollingFetcher = withLongPolling(mockFetcher, {
      onNextTick: mockNextTick,
      onError: mockStartBackoff,
      delay: 500
    })

    const promise = pollingFetcher('source-val', controller.signal)
    promise.catch(() => { })

    controller.abort()

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockNextTick).not.toHaveBeenCalled()
  })

  describe('withLongPolling — Работа с массивами и коллекциями', () => {

    it('должен корректно передавать актуальный состав иммутабельного массива при циклическом опросе', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('polling-array-data')
      const mockNextTick = vi.fn()
      const mockOnError = vi.fn() // Мокаем обязательное поле onError
      const controller = new AbortController()

      const pollingFetcher = withLongPolling(mockFetcher, {
        onNextTick: mockNextTick,
        onError: mockOnError, // Передаем обязательный параметр
        delay: 500
      })

      // Имитируем первый запрос с массивом параметров
      const currentFilters = ['active', 'urgent']
      const promise = pollingFetcher(currentFilters, controller.signal)

      await vi.advanceTimersByTimeAsync(0)
      const result = await promise

      expect(result).toBe('polling-array-data')
      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(mockFetcher).toHaveBeenCalledWith(['active', 'urgent'], controller.signal)

      // Проверяем, что через 500мс взвелся триггер перехода на следующий шаг
      await vi.advanceTimersByTimeAsync(500)
      expect(mockNextTick).toHaveBeenCalledTimes(1)
    })

    it('должен нативно прокидывать свежие элементы Proxy-массива в fetcher при мутациях .push() без смены ссылок', async () => {
      const engine = new ReactiveEngine()
      const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `fetched_${arr.join('_')}`)
      const mockNextTick = vi.fn()
      const mockOnError = vi.fn() // Мокаем обязательное поле onError
      const controller = new AbortController()

      const pollingFetcher = withLongPolling(mockFetcher, {
        onNextTick: mockNextTick,
        onError: mockOnError, // Передаем обязательный параметр
        delay: 1000
      })

      // Создаем мутабельный Proxy-массив в ядре
      const state = engine.reactive({
        roomIds: ['room_101']
      })

      // Запускаем первую итерацию длинного опроса
      const promise1 = pollingFetcher(state.roomIds, controller.signal)
      await vi.advanceTimersByTimeAsync(0)

      const res1 = await promise1
      expect(res1).toBe('fetched_room_101')
      expect(mockFetcher).toHaveBeenCalledWith(['room_101'], controller.signal)

      // Императивно добавляем комнату в массив (ссылка на state.roomIds осталась той же самой)
      state.roomIds.push('room_102')
      await new Promise<void>((r) => queueMicrotask(r)) // даем отработать Proxy-автобатчингу

      // Запускаем вторую сессию опроса с тем же самым прокси-массивом
      const promise2 = pollingFetcher(state.roomIds, controller.signal)
      await vi.advanceTimersByTimeAsync(0)

      const res2 = await promise2

      // Декоратор обязан нативно прочитать мутировавший прокси-массив и отправить свежий состав по сети!
      expect(res2).toBe('fetched_room_101_room_102')
      expect(mockFetcher).toHaveBeenCalledTimes(2)
      expect(mockFetcher).toHaveBeenLastCalledWith(['room_101', 'room_102'], controller.signal)
    })

  })

})
