import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withCache } from './withCache'
import { ReactiveEngineCore } from '../../core/core' // Импортируем ядро для проверки Proxy-мутаций

describe('Decorator — withCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('должен делать реальный запрос при первом вызове, кэшировать его и разделять кэш по ключам', async () => {
    const fetcher = vi.fn(async (id: string, _sig: AbortSignal) => `data_${id}`)
    const cachedFetcher = withCache(fetcher)
    const controller = new AbortController()

    // 1. Первый вызов — идет реальный запрос в сеть
    const res1 = await cachedFetcher('1', controller.signal)
    expect(res1).toBe('data_1')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 2. Второй вызов с тем же ключом — берется готовое значение из кэша
    const res2 = await cachedFetcher('1', controller.signal)
    expect(res2).toBe('data_1')
    expect(fetcher).toHaveBeenCalledTimes(1) // Счетчик вызовов фетчера НЕ вырос

    // 3. Вызов с другим ключом — создается новый независимый запрос
    const res3 = await cachedFetcher('2', controller.signal)
    expect(res3).toBe('data_2')
    expect(fetcher).toHaveBeenCalledTimes(2) // Фетчер вызвался для нового ключа
  })

  it('должен инвалидировать кэш по истечении TTL (включая дефолтные 5 минут)', async () => {
    const fetcher = vi.fn(async (_src: string, _sig: AbortSignal) => 'payload')

    // Проверяем кастомный TTL (1 секунда)
    const cachedFetcherCustom = withCache(fetcher, { ttl: 1000 })
    const controller = new AbortController()

    await cachedFetcherCustom('key', controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Сдвигаем время на 500мс — кэш все еще валиден
    await vi.advanceTimersByTimeAsync(500)
    await cachedFetcherCustom('key', controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Сдвигаем время за пределы TTL (еще на 600мс, суммарно 1100мс) — кэш инвалидирован!
    await vi.advanceTimersByTimeAsync(600)
    await cachedFetcherCustom('key', controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(2) // Произошел честный повторный сетевой запрос

    // Проверяем дефолтный TTL (5 минут = 300 000мс)
    const cachedFetcherDefault = withCache(fetcher)
    await cachedFetcherDefault('default_key', controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(3)

    // Перематываем время вперед на 5 минут и 1 секунду
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000)
    await cachedFetcherDefault('default_key', controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(4) // Дефолтный TTL успешно отработал
  })

  it('должен прокидывать ошибку fetcher наружу, если запрос упал', async () => {
    const fetcher = vi.fn(async (_src: string, _sig: AbortSignal) => {
      throw new Error('Network Error')
    })
    const cachedFetcher = withCache(fetcher)
    const controller = new AbortController()

    // Проверяем, что декоратор прозрачно транслирует исключения фетчера наружу
    await expect(cachedFetcher('fail_key', controller.signal)).rejects.toThrow('Network Error')
  })

  it('должен возвращать данные из кэша для массивов с разными ссылками, но одинаковым содержимым', async () => {
    const fetcher = vi.fn(async (arr: string[], _sig: AbortSignal) => `processed_${arr.length}`)
    const cachedFetcher = withCache(fetcher)
    const controller = new AbortController()

    const arrayInstance1 = ['javascript', 'typescript']
    const arrayInstance2 = ['javascript', 'typescript'] // Абсолютно другая ссылка в памяти V8

    // 1. Делаем первый вызов со ссылкой №1
    const res1 = await cachedFetcher(arrayInstance1, controller.signal)
    expect(res1).toBe('processed_2')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 2. Делаем второй вызов со ссылкой №2 (содержимое идентично)
    const res2 = await cachedFetcher(arrayInstance2, controller.signal)

    // Благодаря JSON.stringify сериализации ключей, декоратор видит идентичность контента!
    expect(res2).toBe('processed_2')
    expect(fetcher).toHaveBeenCalledTimes(1) // Повторного запроса в сеть не было
  })

  it('должен мгновенно и синхронно инвалидировать кэш при нативной мутации .push() внутри Proxy-массива', async () => {
    const engine = new ReactiveEngineCore()

    // Создаем реактивный Proxy-массив внутри нашего синхронного ядра
    const reactiveArray = engine.reactive(['milk'])

    const fetcher = vi.fn(async (arr: string[], _sig: AbortSignal) => `length_${arr.length}`)
    const cachedFetcher = withCache(fetcher)
    const controller = new AbortController()

    // 1. Первый прогон — кэшируем стартовое состояние ['milk']
    const res1 = await cachedFetcher(reactiveArray, controller.signal)
    expect(res1).toBe('length_1')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Повторный вызов — строгий кэш
    await cachedFetcher(reactiveArray, controller.signal)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 2. Выполняем нативную деструктивную мутацию массива «на месте»
    // Наше ядро ловит этот пуш и синхронно инкрементирует внутренний токен коллекции (target._version++)
    reactiveArray.push('eggs')

    // 3. Вызываем фетчер снова. Так как содержимое изменилось, сгенерированный JSON.stringify ключ кэша
    // автоматически станет другим ('["milk","eggs"]' вместо '["milk"]'), мгновенно инвалидируя старое значение!
    const res2 = await cachedFetcher(reactiveArray, controller.signal)
    expect(res2).toBe('length_2')
    expect(fetcher).toHaveBeenCalledTimes(2) // Произошел честный, моментальный пересчет!
  })
})
