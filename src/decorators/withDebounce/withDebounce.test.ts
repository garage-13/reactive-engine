import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withDebounce } from './withDebounce' // Предполагаем, что декоратор лежит в этом же каталоге

describe('withDebounce decorator', () => {
  beforeEach(() => {
    // Включаем фейковые таймеры перед каждым тестом
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Возвращаем реальное время назад и очищаем все моки
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('должен успешно выполнить запрос после окончания задержки', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('success-data')
    const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

    const controller = new AbortController()

    // Запускаем обертку
    const promise = debouncedFetcher('query-1', controller.signal)

    // До перемотки времени оригинальный фетчер не должен быть вызван
    expect(mockFetcher).not.toHaveBeenCalled()

    // Перематываем время на 300 мс вперёд
    vi.advanceTimersByTime(300)

    // Дожидаемся разрешения промиса
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

    // Имитируем быстрый ввод пользователя (3 вызова подряд)
    const p1 = debouncedFetcher('a', controller1.signal)
    vi.advanceTimersByTime(100) // прошло 100мс, дебаунс еще ждет

    const p2 = debouncedFetcher('ab', controller2.signal)
    vi.advanceTimersByTime(100) // прошло еще 100мс

    const p3 = debouncedFetcher('abc', controller3.signal)

    // Первые два промиса должны быть отклонены декоратором как AbortError
    await expect(p1).rejects.toThrow('Aborted due to debounce')
    await expect(p2).rejects.toThrow('Aborted due to debounce')

    // Перематываем оставшиеся 300 мс для последнего вызова
    vi.advanceTimersByTime(300)

    const result = await p3

    // В итоге оригинальный фетчер вызвался строго 1 раз с последним значением
    expect(mockFetcher).toHaveBeenCalledTimes(1)
    expect(mockFetcher).toHaveBeenCalledWith('abc', controller3.signal)
    expect(result).toBe('fresh-data')
  })

  it('должен мгновенно прерывать ожидание, если нативный AbortSignal отменили до окончания таймаута', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('data')
    const debouncedFetcher = withDebounce(mockFetcher, { delay: 300 })

    const controller = new AbortController()

    const promise = debouncedFetcher('test', controller.signal)

    vi.advanceTimersByTime(150) // Прошла половина времени

    // Программно отменяем запрос (например, компонент размонтировался)
    controller.abort()

    // Промис должен отклониться с ошибкой отмены сигнала
    await expect(promise).rejects.toThrow('Aborted by resource signal')

    // Перематываем время до конца, чтобы убедиться, что фетчер НЕ вызвался
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

    // Проверяем, что декоратор успешно транслирует ошибку оригинальной функции
    await expect(promise).rejects.toThrow('Сбой сервера 500')
  })
})
