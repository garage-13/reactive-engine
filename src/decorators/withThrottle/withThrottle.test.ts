import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withThrottle } from './withThrottle'

describe('withThrottle decorator', () => {
  let fakeNow = 1000

  beforeEach(() => {
    fakeNow = 1000
    // Подменяем системный Date.now управляемой переменной fakeNow
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)
    // ВАЖНО: Используем реальные таймеры, чтобы избежать дедлоков в async setTimeout
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('должен выполнить первый вызов мгновенно (Leading edge) без ожидания', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('immediate-data')
    const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })
    const controller = new AbortController()

    const result = await throttledFetcher('call-1', controller.signal)

    expect(mockFetcher).toHaveBeenCalledTimes(1)
    expect(result).toBe('immediate-data')
  })

  it('должен заблокировать промежуточные вызовы, но выполнить последний на хвосте (Trailing edge)', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('final-data')
    const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

    const c1 = new AbortController()
    const c2 = new AbortController()
    const c3 = new AbortController()

    // 1. Первый вызов (отметка 1000мс) -> Срабатывает сразу (Leading)
    throttledFetcher('value-1', c1.signal)
    expect(mockFetcher).toHaveBeenCalledTimes(1)

    // Смещаем время вперед на 100мс (отметка 1100мс)
    fakeNow += 100

    // 2. Промежуточный вызов -> Будет заблокирован и перебит следующим
    const p2 = throttledFetcher('value-2', c2.signal)

    fakeNow += 50 // отметка 1150мс

    // 3. Хвостовой вызов -> Запомнится как финальный
    const p3 = throttledFetcher('value-3', c3.signal)

    // Проверяем, что промежуточный вызов отклонен декоратором
    await expect(p2).rejects.toThrow('Aborted due to newer throttled value')

    // Перематываем виртуальное время до конца лимита (прошло 300мс с начала, отметка 1300мс)
    fakeNow = 1300

    // Ждем окончания реальной микросекундной макрозадачи setTimeout
    const result3 = await p3

    expect(mockFetcher).toHaveBeenCalledTimes(2)
    expect(mockFetcher).toHaveBeenLastCalledWith('value-3', c3.signal)
    expect(result3).toBe('final-data')
  })

  it('новый прямой вызов по истечении лимита должен выполняться мгновенно как Leading', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('fresh')
    const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

    const c1 = new AbortController()
    const c2 = new AbortController()
    const c3 = new AbortController()

    // 1. Первый вызов (отметка 1000мс) -> Leading (срабатывает сразу)
    throttledFetcher('1', c1.signal)
    expect(mockFetcher).toHaveBeenCalledTimes(1)

    fakeNow += 150 // отметка 1150мс

    // 2. Второй вызов -> Trailing (встает в хвост таймера)
    const p2 = throttledFetcher('2', c2.signal)

    // Имитируем прохождение времени до отметки 1300мс (конец лимита)
    fakeNow = 1300
    await p2 // Дожидаемся успешного выполнения хвоста

    // Дополнительно смещаем время вперед (отметка 1500мс) — окно блокировки гарантированно закрыто
    fakeNow = 1500

    // 3. Третий вызов -> Лимит истек. Должен пробиться мгновенно как новый Leading
    const p3 = throttledFetcher('3', c3.signal)
    await p3

    // Проверяем, что все три вызова успешно дошли до оригинального фетчера
    expect(mockFetcher).toHaveBeenCalledTimes(3)
    expect(mockFetcher).toHaveBeenLastCalledWith('3', c3.signal)
  })
})
