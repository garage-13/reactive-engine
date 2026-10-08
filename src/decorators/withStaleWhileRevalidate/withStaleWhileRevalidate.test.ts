import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withStaleWhileRevalidate } from './withStaleWhileRevalidate'
import { ReactiveEngine } from '../../core/core' // Укажите ваш правильный относительный путь

describe('withStaleWhileRevalidate decorator', () => {
  let fetcherSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    fetcherSpy = vi.fn(async (source: any, signal: AbortSignal) => {
      return `data_for_${JSON.stringify(source)}`
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('должен делать реальный запрос при самом первом вызове (кэш пуст)', async () => {
    const cachedFetcher = withStaleWhileRevalidate(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    const res = await cachedFetcher('user_1', abortSignal)
    expect(res).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(1)
  })

  it('должен возвращать stale-данные из кэша при ошибке или отмене повторного вызова, если их TTL валиден', async () => {
    // Включаем TTL на 5000 миллисекунд
    const cachedFetcher = withStaleWhileRevalidate(fetcherSpy, { ttl: 5000, isLogsEnabled: false })
    const abortSignal = new AbortController().signal

    // 1. Первый успешный вызов — прогреваем кэш
    const res1 = await cachedFetcher('user_1', abortSignal)
    expect(res1).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    // Имитируем падение бэкенда (сетевой сбой) для повторного вызова
    fetcherSpy.mockRejectedValueOnce(new Error('500 Internal Server Error'))

    // 2. Повторный вызов — бэкенд лежит, но TTL кэша еще валиден!
    const resFallback = await cachedFetcher('user_1', abortSignal)

    // Декоратор обязан перехватить 500-ю ошибку и мягко отдать старый валидный кэш!
    expect(resFallback).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(2) // Запрос честно пытался сходить по сети
  })


  it('должен полностью стирать кэш и делать честный жесткий запрос, если TTL истек', async () => {
    const cachedFetcher = withStaleWhileRevalidate(fetcherSpy, { ttl: 5000 })
    const abortSignal = new AbortController().signal

    await cachedFetcher('user_1', abortSignal)
    expect(fetcherSpy).toHaveBeenCalledTimes(1)

    // Полностью перематываем TTL
    await vi.advanceTimersByTimeAsync(5001)

    const res = await cachedFetcher('user_1', abortSignal)
    // Кэш мертв, это не SWR-ревалидация, а жесткий новый запрос
    expect(res).toBe('data_for_"user_1"')
    expect(fetcherSpy).toHaveBeenCalledTimes(2)
  })

  describe('withStaleWhileRevalidate — Работа с массивами и коллекциями', () => {

    it('должен успешно отдавать stale-кэш для массивов при сетевом сбое, если у них одинаковое содержимое (Структурный SWR-ключ)', async () => {
      const cachedFetcher = withStaleWhileRevalidate(fetcherSpy, { ttl: 5000, isLogsEnabled: false })
      const abortSignal = new AbortController().signal

      // 1. Первый успешный вызов с копией массива №1
      const arr1 = ['js', 'ts']
      await cachedFetcher(arr1, abortSignal)
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // Имитируем падение сети на повторном запросе
      fetcherSpy.mockRejectedValueOnce(new Error('Network Error'))

      // 2. Повторный вызов с копией массива №2 (другая ссылка в памяти, но то же содержимое)
      const arr2 = ['js', 'ts']
      const resStale = await cachedFetcher(arr2, abortSignal)

      // SWR-механизм обязан понять, что структуры равны, перехватить ошибку и выдать кэш!
      expect(resStale).toBe('data_for_["js","ts"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(2)
    })

    it('должен прокидывать ошибку дальше и не возвращать stale-кэш, если внутри Proxy-массива произошла мутация .push()', async () => {
      const engine = new ReactiveEngine()
      const cachedFetcher = withStaleWhileRevalidate(fetcherSpy, { ttl: 5000, isLogsEnabled: false })
      const abortSignal = new AbortController().signal

      // Создаем мутабельный Proxy-массив в ядре
      const state = engine.reactive({
        filters: ['active']
      })

      // 1. Первый успешный вызов — заносим в кэш слепок ["active"]
      const res1 = await cachedFetcher(state.filters, abortSignal)
      expect(res1).toBe('data_for_["active"]')
      expect(fetcherSpy).toHaveBeenCalledTimes(1)

      // 2. Императивно мутируем массив (ссылка прежняя, состав новый)
      state.filters.push('archived')
      await new Promise<void>((r) => queueMicrotask(r)) // даем отработать Proxy-автобатчингу

      // Имитируем падение бэкенда
      fetcherSpy.mockRejectedValueOnce(new Error('Fatal Crunch'))

      // 3. Вызываем фетчер снова. Поскольку состав изменился, старый кэш ["active"]
      // больше не является валидным для нового ключа ["active","archived"]!
      // Декоратор обязан проигнорировать старый кэш и честно выбросить ошибку наружу в граф.
      await expect(cachedFetcher(state.filters, abortSignal)).rejects.toThrow('Fatal Crunch')
      expect(fetcherSpy).toHaveBeenCalledTimes(2)
    })

  })
})
