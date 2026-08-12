import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withCache } from './withCache'

describe('withCache Decorator', () => {
  // Нам понадобится шпион-заглушка для имитации fetcher
  let fetcherSpy: any

  beforeEach(() => {
    // Включаем фейковые таймеры перед каждым тестом
    vi.useFakeTimers()
    // Сбрасываем шпион, возвращая каждый раз строку с уникальным id
    fetcherSpy = vi.fn(async (source: any, signal: AbortSignal) => {
      return `data_for_${JSON.stringify(source)}`
    })
  })

  afterEach(() => {
    // Возвращаем реальное системное время обратно
    vi.useRealTimers()
  })

  it('должен делать реальный запрос при первом вызове и кэшировать его', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    // 1. Первый вызов
    const res1 = await cachedFetcher('user_1', abortSignal)
    expect(res1).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    // 2. Второй вызов с теми же параметрами
    const res2 = await cachedFetcher('user_1', abortSignal)
    expect(res2).toBe('data_for_"user_1"')
    // fetcherSpy НЕ должен быть вызван повторно, так как данные вернулись из кэша
    expect(fetcherSpy).toHaveBeenCalledTimes(1)
  })

  it('должен разделять кэш для разных зависимостей (source)', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    // Делаем запросы с разными ключами
    await cachedFetcher({ userId: 1, tab: 'posts' }, abortSignal)
    await cachedFetcher({ userId: 1, tab: 'photos' }, abortSignal)

    // Должно произойти два полноценных сетевых вызова
    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  it('должен инвалидировать кэш и делать новый запрос по истечении TTL', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 }) // TTL = 5 секунд
    const abortSignal = new AbortController().signal

    // 1. Первый запрос (сохранение в кэш)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    // Перематываем время вперед на 4.9 секунды (кэш еще валиден)
    await vi.advanceTimersByTimeAsync(4900)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1) // Сеть не вызывалась

    // Перематываем время еще на 200 мс (суммарно 5.1 секунды — TTL истек)
    await vi.advanceTimersByTimeAsync(200)

    // 2. Третий запрос — кэш протух, должен сработать реальный fetcher
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  it('должен использовать дефолтный TTL (5 минут), если опции не переданы', async () => {
    const cachedFetcher = withCache(fetcherSpy) // Опции опущены
    const abortSignal = new AbortController().signal

    await cachedFetcher('user_1', abortSignal)

    // Перематываем время на 4 минуты (кэш должен быть жив)
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    // Перематываем за лимит в 5 минут
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000 + 1)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(2) // Запрос перезапустился
  })

  it('должен прокидывать ошибку fetcher наружу, если запрос упал', async () => {
    const errorFetcher = vi.fn().mockRejectedValue(new Error('Network Crash'))
    const cachedFetcher = withCache(errorFetcher)
    const abortSignal = new AbortController().signal

    await expect(cachedFetcher('user_1', abortSignal)).rejects.toThrow('Network Crash')
  })
})
