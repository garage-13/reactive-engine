import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withThrottleAndCache } from './withThrottleAndCache'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../../core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — withThrottleAndCache Decorator`, () => {

    let fakeNow = 1000

    beforeEach(() => {
      fakeNow = 1000
      // Подменяем системный метод управляемой переменной fakeNow
      vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)
      // Нативные таймеры гарантируют мгновенное разрешение async/await внутри setTimeout
      vi.useRealTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it.skip('должен пропустить первый вызов мгновенно и сохранить результат в кэш', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('data-1')
      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
      const controller = new AbortController()

      const result = await optimizedFetcher('query-A', controller.signal)

      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(result).toBe('data-1')
    })

    it.skip('должен заблокировать частые вызовы по правилам троттлинга, но вернуть данные из кэша, если они там есть', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('cached-response')
      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

      const c1 = new AbortController()
      const c2 = new AbortController()

      // 1. Первый вызов (отметка 1000мс) -> Инициализирует кэш для 'query-A'
      await optimizedFetcher('query-A', c1.signal)
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      fakeNow += 100

      // 2. Второй вызов с ТЕМ ЖЕ ключом -> Срабатывает троттлинг Trailing edge
      const promise = optimizedFetcher('query-A', c2.signal)

      fakeNow = 1300
      const result = await promise

      // ПРОВЕРКА КЭША: Троттлинг пропустил вызов на хвосте, но декоратор взял данные из памяти
      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(result).toBe('cached-response')
    })

    it.skip('должен сходить в сеть повторно, если лимит троттлинга прошел, но TTL кэша уже истек', async () => {
      let callCount = 0
      const mockFetcher = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve(`data-${callCount}`)
      })

      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 1000 })
      const c1 = new AbortController()
      const c2 = new AbortController()

      const res1 = await optimizedFetcher('query-B', c1.signal)
      expect(res1).toBe('data-1')

      fakeNow = 2500

      const res2 = await optimizedFetcher('query-B', c2.signal)
      expect(mockFetcher).toHaveBeenCalledTimes(2)
      expect(res2).toBe('data-2')
    })

    it.skip('при быстром вводе разных ключей должен корректно отработать троттлинг последнего значения', async () => {
      const mockFetcher = vi.fn().mockImplementation((val) => Promise.resolve(`res-${val}`))
      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

      const c1 = new AbortController()
      const c2 = new AbortController()
      const c3 = new AbortController()

      optimizedFetcher('key-1', c1.signal)
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      fakeNow += 100

      const p2 = optimizedFetcher('key-2', c2.signal)
      fakeNow += 50

      const p3 = optimizedFetcher('key-3', c3.signal)

      await expect(p2).rejects.toThrow('Aborted due to newer throttled value')

      fakeNow = 1300
      const finalResult = await p3

      expect(mockFetcher).toHaveBeenCalledTimes(2)
      expect(mockFetcher).toHaveBeenLastCalledWith('key-3', c3.signal)
      expect(finalResult).toBe('res-key-3')
    })

    // ====================================================
    //  withThrottleAndCache — Работа с массивами и коллекциями
    // ====================================================
    describe('withThrottleAndCache — Работа с массивами и коллекциями', () => {

      it.skip('должен успешно возвращать кэш для массивов с разными ссылками, но одинаковым содержимым (Сигналы и Computed)', async () => {
        const mockFetcher = vi.fn().mockResolvedValue('cached-array-data')
        const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
        const controller = new AbortController()

        const arrayRef1 = ['active', 'urgent']
        const res1 = await optimizedFetcher(arrayRef1, controller.signal)
        expect(res1).toBe('cached-array-data')
        expect(mockFetcher).toHaveBeenCalledTimes(1)

        fakeNow += 50

        const arrayRef2 = ['active', 'urgent']
        const promise2 = optimizedFetcher(arrayRef2, controller.signal)

        fakeNow = 1300
        const res2 = await promise2

        expect(res2).toBe('cached-array-data')
        expect(mockFetcher).toHaveBeenCalledTimes(1)
      })

      it.skip('должен нативно извлекать свежий состав Proxy-массива на Trailing edge и пробивать сеть при мутациях .push()', async () => {
        const engine = new ReactiveEngine()
        const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `items_count_${arr.length}`)
        const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

        const c1 = new AbortController()
        const c2 = new AbortController()

        const state = engine.reactive({
          ids: ['id_1']
        })

        const res1 = await optimizedFetcher(state.ids, c1.signal)
        expect(res1).toBe('items_count_1')
        expect(mockFetcher).toHaveBeenCalledWith(['id_1'], c1.signal)

        fakeNow += 100

        const promise2 = optimizedFetcher(state.ids, c2.signal)

        // Нативная императивная мутация — Proxy мгновенно обновляет слепок без queueMicrotask!
        state.ids.push('id_2')
        state.ids.push('id_3')

        fakeNow = 1300
        const res2 = await promise2

        // Декоратор фиксирует смену структурного хэша и пробивает сеть
        expect(res2).toBe('items_count_3')
        expect(mockFetcher).toHaveBeenCalledTimes(2)
        expect(mockFetcher).toHaveBeenLastCalledWith(state.ids, c2.signal)
      })

      it.skip('должен корректно обновлять кэш при мутабельном переприсваивании массивов в Сигналах', async () => {
        const engine = new ReactiveEngine()
        let callCount = 0
        const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => {
          callCount++
          return `fetch_${callCount}_[${arr.join('-')}]`
        })

        const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
        const controller = new AbortController()

        const tagsSignal = engine.signal(['js'])

        const res1 = await optimizedFetcher(tagsSignal.value, controller.signal)
        expect(res1).toBe('fetch_1_[js]')

        fakeNow += 400

        // Мутируем массив напрямую и пинаем сеттер самому себе
        tagsSignal.value.push('ts')
        tagsSignal.value = tagsSignal.value

        const res2 = await optimizedFetcher(tagsSignal.value, controller.signal)
        expect(res2).toBe('fetch_2_[js-ts]')
        expect(mockFetcher).toHaveBeenCalledTimes(2)
      })

    })
  })
})
