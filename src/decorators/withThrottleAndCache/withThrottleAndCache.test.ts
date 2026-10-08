import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withThrottleAndCache } from './withThrottleAndCache'
import { ReactiveEngine } from '../../core/core'

describe('withThrottleAndCache decorator', () => {
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

  it('должен пропустит первый вызов мгновенно и сохранить результат в кэш', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('data-1')
    // Ограничение частоты 300мс, время жизни кэша 5 секунд
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
    const controller = new AbortController()

    const result = await optimizedFetcher('query-A', controller.signal)

    // Первый вызов (Leading edge) пробивается в сеть сразу
    expect(mockFetcher).toHaveBeenCalledTimes(1)
    expect(result).toBe('data-1')
  })

  it('должен заблокировать частые вызовы по правилам троттлинга, но вернуть данные из кэша, если они там есть', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('cached-response')
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

    const c1 = new AbortController()
    const c2 = new AbortController()

    // 1. Первый вызов (отметка 1000мс) -> Инициализирует кэш для 'query-A'
    await optimizedFetcher('query-A', c1.signal)
    expect(mockFetcher).toHaveBeenCalledTimes(1)

    // Смещаем время вперед, но остаемся внутри окна блокировки (отметка 1100мс)
    fakeNow += 100

    // 2. Второй вызов с ТЕМ ЖЕ ключом -> Срабатывает троттлинг Trailing edge (встает в хвост)
    const promise = optimizedFetcher('query-A', c2.signal)

    // Перематываем время к окончанию лимита троттлинга (отметка 1300мс)
    fakeNow = 1300

    // Дожидаемся срабатывания хвостового вызова
    const result = await promise

    // ПРОВЕРКА КЭША: Троттлинг пропустил вызов на хвосте, но декоратор взял данные
    // из оперативной памяти. Сетевой fetcher НЕ вызывался повторно.
    expect(mockFetcher).toHaveBeenCalledTimes(1)
    expect(result).toBe('cached-response')
  })

  it('должен сходить в сеть повторно, если лимит троттлинга прошел, но TTL кэша уже истек', async () => {
    let callCount = 0
    // Фетчер на каждый вызов отдает инкрементированную строку
    const mockFetcher = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve(`data-${callCount}`)
    })

    // Настраиваем короткий TTL кэша в 1000мс
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 1000 })
    const c1 = new AbortController()
    const c2 = new AbortController()

    // 1. Первый вызов (отметка 1000мс) -> Срабатывает сеть (data-1)
    const res1 = await optimizedFetcher('query-B', c1.signal)
    expect(res1).toBe('data-1')

    // Перематываем виртуальное время далеко вперед, перешагивая и лимит, и TTL (отметка 2500мс)
    fakeNow = 2500

    // 2. Второй вызов -> Окно троттлинга открыто, но кэш протух
    const res2 = await optimizedFetcher('query-B', c2.signal)

    // Декоратор сделал повторный честный сетевой запрос
    expect(mockFetcher).toHaveBeenCalledTimes(2)
    expect(res2).toBe('data-2')
  })

  it('при быстром вводе разных ключей должен корректно отработать троттлинг последнего значения', async () => {
    const mockFetcher = vi.fn().mockImplementation((val) => Promise.resolve(`res-${val}`))
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

    const c1 = new AbortController()
    const c2 = new AbortController()
    const c3 = new AbortController()

    // 1. Первый мгновенный вызов (0мс) -> Leading edge
    optimizedFetcher('key-1', c1.signal)
    expect(mockFetcher).toHaveBeenCalledTimes(1)

    fakeNow += 100 // отметка 1100мс

    // 2. Промежуточный вызов -> Встает в хвост, но будет перебит
    const p2 = optimizedFetcher('key-2', c2.signal)

    fakeNow += 50 // отметка 1150мс

    // 3. Последний вызов -> Перебивает прошлый хвост и фиксируется как финальный
    const p3 = optimizedFetcher('key-3', c3.signal)

    // Проверяем, что промежуточный промис отклонен декоратором с AbortError
    await expect(p2).rejects.toThrow('Aborted due to newer throttled value')

    // Имитируем окончание лимита троттлинга (отметка 1300мс)
    fakeNow = 1300

    const finalResult = await p3

    // На хвосте выполнился запрос именно для последнего актуального ключа
    expect(mockFetcher).toHaveBeenCalledTimes(2)
    expect(mockFetcher).toHaveBeenLastCalledWith('key-3', c3.signal)
    expect(finalResult).toBe('res-key-3')
  })

  describe('withThrottleAndCache — Работа с массивами и коллекциями', () => {

    it('должен успешно возвращать кэш для массивов с разными ссылками, но одинаковым содержимым (Сигналы и Computed)', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('cached-array-data')
      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
      const controller = new AbortController()

      // 1. Первый вызов с массивом-ссылкой №1 (Leading edge улетает в сеть)
      const arrayRef1 = ['active', 'urgent']
      const res1 = await optimizedFetcher(arrayRef1, controller.signal)
      expect(res1).toBe('cached-array-data')
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      fakeNow += 50 // смещаем время, остаемся внутри окна троттлинга

      // 2. Второй вызов с массивом-ссылкой №2 (другая ссылка, но то же содержимое)
      const arrayRef2 = ['active', 'urgent']
      const promise2 = optimizedFetcher(arrayRef2, controller.signal)

      fakeNow = 1300 // закрываем окно троттлинга, срабатывает Trailing edge
      const res2 = await promise2

      // Благодаря структурной сериализации ключей, декоратор обнаруживает попадание в кэш!
      expect(res2).toBe('cached-array-data')
      expect(mockFetcher).toHaveBeenCalledTimes(1) // Сетевой фетчер НЕ дергался повторно
    })

    it('должен нативно извлекать свежий состав Proxy-массива на Trailing edge и пробивать сеть при мутациях .push()', async () => {
      const engine = new ReactiveEngine()
      const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `items_count_${arr.length}`)
      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })

      const c1 = new AbortController()
      const c2 = new AbortController()

      // Инициализируем объект с ключом `ids`
      const state = engine.reactive({
        ids: ['id_1']
      })

      // 1. Первый вызов (Leading edge) -> сразу улетает в сеть со слепком ['id_1']
      const res1 = await optimizedFetcher(state.ids, c1.signal)
      expect(res1).toBe('items_count_1')
      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(mockFetcher).toHaveBeenCalledWith(['id_1'], c1.signal)

      fakeNow += 100 // отметка 1100мс (внутри окна блокировки троттлинга)

      // 2. Повторный вызов -> Встает в хвост планировщика (Trailing edge)
      const promise2 = optimizedFetcher(state.ids, c2.signal)

      // Императивно мутируем этот же прокси-массив до срабатывания таймера хвоста
      state.ids.push('id_2')
      state.ids.push('id_3')
      await new Promise<void>((r) => queueMicrotask(r)) // даем отработать Proxy-автобатчингу ядра

      // Перематываем виртуальное время на конец лимита (1300мс), триггеря таймер
      fakeNow = 1300
      const res2 = await promise2

      // ИСПРАВЛЕНО: Теперь проверяем строго `state.ids`, компилятор полностью счастлив!
      expect(res2).toBe('items_count_3')
      expect(mockFetcher).toHaveBeenCalledTimes(2)
      expect(mockFetcher).toHaveBeenLastCalledWith(state.ids, c2.signal)
    })

    it('должен корректно обновлять кэш при мутабельном переприсваивании массивов в Сигналах', async () => {
      const engine = new ReactiveEngine()
      let callCount = 0
      const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => {
        callCount++
        return `fetch_${callCount}_[${arr.join('-')}]`
      })

      const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 })
      const controller = new AbortController()

      const tagsSignal = engine.signal(['js'])

      // 1. Первый вызов — греем кэш слепком ['js']
      const res1 = await optimizedFetcher(tagsSignal.value, controller.signal)
      expect(res1).toBe('fetch_1_[js]')

      fakeNow += 400 // полностью закрываем окно троттлинга (отметка 1400мс)

      // 2. Мутируем массив в сигнале ядра и пинаем его сеттер
      tagsSignal.value.push('ts')
      tagsSignal.value = tagsSignal.value
      await new Promise<void>((r) => queueMicrotask(r))

      // 3. Делаем новый вызов — окно троттлинга открыто, но ключ изменился, поэтому идет запрос в сеть
      const res2 = await optimizedFetcher(tagsSignal.value, controller.signal)
      expect(res2).toBe('fetch_2_[js-ts]')
      expect(mockFetcher).toHaveBeenCalledTimes(2)
    })

  })
})
