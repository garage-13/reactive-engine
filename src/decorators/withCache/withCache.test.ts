import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withCache } from './withCache'
import { ReactiveEngine } from '../../core/core'

describe('withCache Decorator', () => {
  let fetcherSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    fetcherSpy = vi.fn(async (source: any, signal: AbortSignal) => {
      return `data_for_${JSON.stringify(source)}`
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('должен делать реальный запрос при первом вызове и кэшировать его', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    const res1 = await cachedFetcher('user_1', abortSignal)
    expect(res1).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    const res2 = await cachedFetcher('user_1', abortSignal)
    expect(res2).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(1)
  })

  it('должен разделять кэш для разных зависимостей (source)', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    await cachedFetcher({ userId: 1, tab: 'posts' }, abortSignal)
    await cachedFetcher({ userId: 1, tab: 'photos' }, abortSignal)

    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  it('должен инвалидировать кэш и делать новый запрос по истечении TTL', async () => {
    const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4900)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)

    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  it('должен использовать дефолтный TTL (5 минут), если опции не переданы', async () => {
    const cachedFetcher = withCache(fetcherSpy)
    const abortSignal = new AbortController().signal

    await cachedFetcher('user_1', abortSignal)

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1 * 60 * 1000 + 1)
    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  it('должен прокидывать ошибку fetcher наружу, если запрос упал', async () => {
    const errorFetcher = vi.fn().mockRejectedValue(new Error('Network Crash'))
    const cachedFetcher = withCache(errorFetcher)
    const abortSignal = new AbortController().signal

    await expect(cachedFetcher('user_1', abortSignal)).rejects.toThrow('Network Crash')
  })

  describe('withCache — Работа с массивами и коллекциями', () => {

    it('должен успешно возвращать данные из кэша для массивов с разными ссылками, но одинаковым содержимым (Глубокое сравнение ключей)', async () => {
      const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
      const abortSignal = new AbortController().signal

      // 1. Первый вызов с инстансом массива №1
      const arrayInstance1 = ['react', 'vue']
      const res1 = await cachedFetcher(arrayInstance1, abortSignal)
      expect(res1).toBe('data_for_["react","vue"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // 2. Второй вызов с совершенно новым инстансом массива №2 (другая ссылка в памяти)
      const arrayInstance2 = ['react', 'vue']
      const res2 = await cachedFetcher(arrayInstance2, abortSignal)

      // Кэш должен сработать! Декоратор обязан сериализовать структуру, а не ссылку.
      expect(res2).toBe('data_for_["react","vue"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(1) // Сетевой fetcherSpy НЕ вызывался повторно
    })

    it('должен сбрасывать/инвалидировать кэш, если внутри Proxy-массива произошла нативная мутация .push() при неизменной ссылке', async () => {
      const engine = new ReactiveEngine()
      const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
      const abortSignal = new AbortController().signal

      // Создаем реактивный Proxy-массив
      const state = engine.reactive({
        tags: ['js']
      })

      // 1. Делаем первый запрос, передавая прокси-массив как source
      const res1 = await cachedFetcher(state.tags, abortSignal)
      expect(res1).toBe('data_for_["js"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // Имитируем повторный быстрый вызов без изменений — должен сработать кэш
      const _resCache = await cachedFetcher(state.tags, abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // 2. Нативно мутируем массив внутри ядра (ссылка на state.tags осталась ТОЙ ЖЕ САМОЙ!)
      state.tags.push('ts')

      // Даем очиститься асинхронному автобатчингу микрозадач прокси
      await new Promise<void>((r) => queueMicrotask(r))

      // 3. Делаем третий запрос с тем же прокси-массивом.
      // Поскольку содержимое изменилось, декоратор обязан зафиксировать смену ключа и пробить сеть заново!
      const res2 = await cachedFetcher(state.tags, abortSignal)
      expect(res2).toBe('data_for_["js","ts"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(2) // Сработал честный второй вызов сети!
    })

  })
})
