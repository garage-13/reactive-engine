import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withCache } from './withCache'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../../core/core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — withCache Decorator`, () => {
    let fetcherSpy: any

    beforeEach(() => {
      vi.useFakeTimers()
      fetcherSpy = vi.fn(async (source: any, _signal: AbortSignal) => {
        return `data_for_${JSON.stringify(source)}`
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('должен делать реальный запрос при первом вызове, кэшировать его и разделять кэш по ключам', async () => {
      const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
      const abortSignal = new AbortController().signal

      // Проверяем первичную запись и попадание в кэш
      const res1 = await cachedFetcher('user_1', abortSignal)
      expect(res1).toBe('data_for_"user_1"')
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      const res2 = await cachedFetcher('user_1', abortSignal)
      expect(res2).toBe('data_for_"user_1"')
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // Проверяем изоляцию разных ключей (source)
      await cachedFetcher('user_2', abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(2)
    })

    it('должен инвалидировать кэш по истечении TTL (включая дефолтные 5 минут)', async () => {
      const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
      const defaultFetcher = withCache(fetcherSpy)
      const abortSignal = new AbortController().signal

      await cachedFetcher('user_1', abortSignal)
      await defaultFetcher('user_1', abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(2)

      // Прокручиваем время на границу короткого TTL (4900мс) — кэш еще живой
      await vi.advanceTimersByTimeAsync(4900)
      await cachedFetcher('user_1', abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(2)

      // Перешагиваем лимит (еще +200мс, суммарно 5100мс) — короткий кэш протух
      await vi.advanceTimersByTimeAsync(200)
      await cachedFetcher('user_1', abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(3)

      // Дефолтный кэш (5 минут) все еще валиден
      await defaultFetcher('user_1', abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(3)
    })

    it('должен прокидывать ошибку fetcher наружу, если запрос упал', async () => {
      const errorFetcher = vi.fn().mockRejectedValue(new Error('Network Crash'))
      const cachedFetcher = withCache(errorFetcher)
      const abortSignal = new AbortController().signal

      await expect(cachedFetcher('user_1', abortSignal)).rejects.toThrow('Network Crash')
    })

    // ====================================================
    //  withCache — Работа с массивами и коллекциями
    // ====================================================
    describe('withCache — Работа с массивами и коллекциями', () => {

      it('должен возвращать данные из кэша для массивов с разными ссылками, но одинаковым содержимым', async () => {
        const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
        const abortSignal = new AbortController().signal

        // Первый вызов с массивом-копией №1
        const res1 = await cachedFetcher(['react', 'vue'], abortSignal)
        expect(res1).toBe('data_for_["react","vue"]')
        expect(fetcherSpy).toHaveBeenCalledTimes(1)

        // Второй вызов с массивом-копией №2 (другая ссылка в памяти)
        const res2 = await cachedFetcher(['react', 'vue'], abortSignal)

        // Декоратор обязан применить структурную сериализацию ключа и выдать кэш без похода в сеть!
        expect(res2).toBe('data_for_["react","vue"]')
        expect(fetcherSpy).toHaveBeenCalledTimes(1)
      })

      it('должен мгновенно и синхронно инвалидировать кэш при нативной мутации .push() внутри Proxy-массива', async () => {
        const engine = new ReactiveEngine()
        const cachedFetcher = withCache(fetcherSpy, { ttl: 5000 })
        const abortSignal = new AbortController().signal

        // Создаем мутабельный Proxy-массив в нашем новом ядре
        const state = engine.reactive({
          tags: ['js']
        })

        // 1. Первый запрос заносит в память слепок ключа '["js"]'
        const res1 = await cachedFetcher(state.tags, abortSignal)
        expect(res1).toBe('data_for_["js"]')
        expect(fetcherSpy).toHaveBeenCalledTimes(1)

        // 2. Императивно мутируем массив (ссылка прежняя, состав новый)
        state.tags.push('ts')

        // Больше никаких асинхронных ожиданий микрозадач!
        // 3. Делаем новый запрос. Декоратор считывает свежий JSON-слепок '["js","ts"]' и бьет по сети!
        const res2 = await cachedFetcher(state.tags, abortSignal)
        expect(res2).toBe('data_for_["js","ts"]')
        expect(fetcherSpy).toHaveBeenCalledTimes(2)
      })

    })
  })
})
