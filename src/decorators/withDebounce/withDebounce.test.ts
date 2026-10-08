import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withDebounce } from './withDebounce'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../../core/core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — withDebounce Decorator`, () => {

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('должен успешно выполнить запрос после окончания задержки', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('success-data')
      const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })
      const controller = new AbortController()

      const promise = debouncedFetcher('query-1', controller.signal)
      expect(mockFetcher).not.toHaveBeenCalled()

      vi.advanceTimersByTime(300)
      const result = await promise

      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(mockFetcher).toHaveBeenCalledWith('query-1', controller.signal)
      expect(result).toBe('success-data')
    })

    it('должен игнорировать промежуточные вызовы и выполнить только последний (Debounce эффект)', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('fresh-data')
      const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const controller3 = new AbortController()

      const p1 = debouncedFetcher('a', controller1.signal)
      vi.advanceTimersByTime(100)

      const p2 = debouncedFetcher('ab', controller2.signal)
      vi.advanceTimersByTime(100)

      const p3 = debouncedFetcher('abc', controller3.signal)

      await expect(p1).rejects.toThrow('Aborted due to debounce')
      await expect(p2).rejects.toThrow('Aborted due to debounce')

      vi.advanceTimersByTime(300)
      const result = await p3

      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(mockFetcher).toHaveBeenCalledWith('abc', controller3.signal)
      expect(result).toBe('fresh-data')
    })

    it('должен мгновенно прерывать ожидание, если нативный AbortSignal отменили до окончания таймаута', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('data')
      const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })
      const controller = new AbortController()

      const promise = debouncedFetcher('test', controller.signal)
      vi.advanceTimersByTime(150)

      controller.abort()
      await expect(promise).rejects.toThrow('Aborted by resource signal')

      vi.advanceTimersByTime(150)
      expect(mockFetcher).not.toHaveBeenCalled()
    })

    it('должен корректно прокидывать наверх ошибку, если оригинальный фетчер упал', async () => {
      const mockError = new Error('Сбой сервера 500')
      const mockFetcher = vi.fn().mockRejectedValue(mockError)
      const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

      const controller = new AbortController()
      const promise = debouncedFetcher('broken-query', controller.signal)

      vi.advanceTimersByTime(300)
      await expect(promise).rejects.toThrow('Сбой сервера 500')
    })

    // ====================================================
    //  withDebounce — Работа с массивами и коллекциями
    // ====================================================
    describe('withDebounce — Работа с массивами и коллекциями', () => {

      it('должен корректно дебаунсить запросы при быстрой смене иммутабельных массивов-фильтров', async () => {
        const mockFetcher = vi.fn().mockResolvedValue('filtered-data')
        const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

        const c1 = new AbortController()
        const c2 = new AbortController()

        const p1 = debouncedFetcher(['react'], c1.signal)
        vi.advanceTimersByTime(150)

        const p2 = debouncedFetcher(['react', 'vue'], c2.signal)
        await expect(p1).rejects.toThrow('Aborted due to debounce')

        vi.advanceTimersByTime(300)
        const result = await p2

        expect(mockFetcher).toHaveBeenCalledTimes(1)
        expect(mockFetcher).toHaveBeenCalledWith(['react', 'vue'], c2.signal)
        expect(result).toBe('filtered-data')
      })

      it('должен корректно дебаунсить вызовы при нативных мутациях .push() одного Proxy-массива в ядре', async () => {
        const engine = new ReactiveEngine()
        const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `len_${arr.length}`)
        const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

        const state = engine.reactive({
          filters: ['js']
        })

        const c1 = new AbortController()
        const c2 = new AbortController()

        // Первый вызов с исходным состоянием прокси-массива
        const p1 = debouncedFetcher(state.filters, c1.signal)
        vi.advanceTimersByTime(100)

        // Императивно мутируем этот же прокси-массив (больше не нужно ждать queueMicrotask!)
        state.filters.push('ts')

        // Повторно пинаем дебаунс-фетчер тем же самым массивом
        const p2 = debouncedFetcher(state.filters, c2.signal)
        await expect(p1).rejects.toThrow('Aborted due to debounce')

        vi.advanceTimersByTime(300)
        const result = await p2

        // Благодаря синхронному графу, фетчер улетает со свежим набором элементов внутри Proxy
        expect(mockFetcher).toHaveBeenCalledTimes(1)
        expect(mockFetcher).toHaveBeenCalledWith(state.filters, c2.signal)
        expect(result).toBe('len_2')
      })

    })
  })
})
