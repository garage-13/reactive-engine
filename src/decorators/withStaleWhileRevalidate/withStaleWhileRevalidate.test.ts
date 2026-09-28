import { describe, it, expect, vi } from 'vitest'
import { withStaleWhileRevalidate } from './withStaleWhileRevalidate'

describe('withStaleWhileRevalidate', () => {
  it('должен успешно возвращать свежие данные при первом вызове', async () => {
    const fetcher = vi.fn().mockResolvedValue('fresh-data')
    const decorated = withStaleWhileRevalidate(fetcher)
    const controller = new AbortController()

    const result = await decorated('source-1', controller.signal)

    expect(result).toBe('fresh-data')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('должен отдавать initialData, если первый запрос был отменен', async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const decorated = withStaleWhileRevalidate(fetcher, { initialData: 'stale-initial' })
    const controller = new AbortController()

    // Имитируем отмену до или во время запроса
    controller.abort()

    const result = await decorated('source-1', controller.signal)

    expect(result).toBe('stale-initial')
  })

  it('должен прокидывать ошибку, если первый запрос упал, а initialData не задан', async () => {
    const networkError = new Error('Network failed')
    const fetcher = vi.fn().mockRejectedValue(networkError)
    const decorated = withStaleWhileRevalidate(fetcher)
    const controller = new AbortController()

    await expect(decorated('source-1', controller.signal)).rejects.toThrow('Network failed')
  })

  it('должен возвращать последнее валидное состояние при последующей отмене (AbortError)', async () => {
    let callCount = 0
    // Первый вызов успешен, второй имитирует отмену движком при смене сигналов
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'first-successful-data'
      throw new DOMException('The operation was aborted.', 'AbortError')
    })

    const decorated = withStaleWhileRevalidate(fetcher)

    // 1. Успешный первый прогон
    const controller1 = new AbortController()
    const firstResult = await decorated('source-1', controller1.signal)
    expect(firstResult).toBe('first-successful-data')

    // 2. Второй прогон (например, пользователь сдвинул карту, bbox изменился, пошла отмена)
    const controller2 = new AbortController()
    const secondResult = await decorated('source-2', controller2.signal)

    // Должно вернуться старое состояние вместо падения графа
    expect(secondResult).toBe('first-successful-data')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('должен возвращать последнее валидное состояние при обычных сетевых ошибках', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'stable-data'
      throw new Error('500 Internal Server Error')
    })

    const decorated = withStaleWhileRevalidate(fetcher)

    // 1. Наполняем кэш замыкания успешными данными
    const res1 = await decorated('param', new AbortController().signal)
    expect(res1).toBe('stable-data')

    // 2. Запрос ломается, но граф защищен и получает старые данные
    const res2 = await decorated('param', new AbortController().signal)
    expect(res2).toBe('stable-data')
  })
})
