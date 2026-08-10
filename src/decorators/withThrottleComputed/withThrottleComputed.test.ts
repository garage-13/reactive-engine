import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from '../../core/core'
import { withThrottleComputed } from './withThrottleComputed'

describe('withThrottleComputed', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
    vi.useFakeTimers() // Контролирует Date.now() и setTimeout безупречно
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('должен синхронно возвращать стартовое значение при инициализации', () => {
    const rawSignal = engine.signal<number>(10, 'raw')

    const throttled = withThrottleComputed(
      engine,
      () => rawSignal.value,
      { limit: 1000 },
      'test:throttled'
    )

    expect(throttled.value).toBe(10)
  })

  it('должен мгновенно пропустить первое изменение и задроттлить последующий спам (Лимит времени)', async () => {
    const rawSignal = engine.signal<number>(0, 'raw')

    const throttled = withThrottleComputed(
      engine,
      () => rawSignal.value,
      { limit: 1000 }
    )

    expect(throttled.value).toBe(0)

    // Первое боевое изменение — пробивается сразу
    rawSignal.value = 1
    await vi.advanceTimersByTimeAsync(0)
    expect(throttled.value).toBe(1)

    // Спамим изменения внутри виртуального окна 1000 мс
    rawSignal.value = 2
    rawSignal.value = 3
    rawSignal.value = 4
    await vi.advanceTimersByTimeAsync(0)

    // Спам гарантированно заблокирован! Значение удерживает единицу!
    expect(throttled.value).toBe(1)
  })

  it('должен гарантированно выполнить хвостовой вызов (Trailing Edge) последнего значения после лимита', async () => {
    const rawSignal = engine.signal<number>(0, 'raw')

    const throttled = withThrottleComputed(
      engine,
      () => rawSignal.value,
      { limit: 1000 }
    )

    rawSignal.value = 1
    await vi.advanceTimersByTimeAsync(0)
    expect(throttled.value).toBe(1)

    // Накапливаем "хвостовой" спам
    rawSignal.value = 2
    rawSignal.value = 42 // Финальный хвост
    await vi.advanceTimersByTimeAsync(0)

    // Лимит времени еще не вышел — на экране по-прежнему единица
    expect(throttled.value).toBe(1)

    // Виртуально крутим время на 1000 мс вперед
    await vi.advanceTimersByTimeAsync(1000)

    // Хвостовое значение долетело безупречно
    expect(throttled.value).toBe(42)
  })

  it('должен корректно вызывать подписки фреймворков при обновлении затроттленного значения', async () => {
    const rawSignal = engine.signal<number>(0, 'raw')

    // Ипользуем vi.fn() — это стандарт для проверки вызовов
    const spyCallback = vi.fn()

    const throttled = withThrottleComputed(
      engine,
      () => rawSignal.value,
      { limit: 1000 }
    )

    throttled.subscribe(spyCallback)

    // Сбрасываем шпион логов после стартового синхронного вызова подписки ядра,
    // чтобы считать строго боевые тики от изменения value!
    spyCallback.mockClear()

    rawSignal.value = 10
    await vi.advanceTimersByTimeAsync(0)
    expect(spyCallback).toHaveBeenCalledTimes(1)

    // Спам блокируется, подписка не дергается вхолостую
    rawSignal.value = 20
    rawSignal.value = 30
    await vi.advanceTimersByTimeAsync(0)
    expect(spyCallback).toHaveBeenCalledTimes(1)

    // Прокручиваем виртуальное время на секунду вперед
    await vi.advanceTimersByTimeAsync(1000)

    // Подписка сработала второй раз на хвостовое значение 30!
    expect(spyCallback).toHaveBeenCalledTimes(2)
  })

  it('должен очищать внутренние таймеры setTimeout при вызове метода destroy', async () => {
    const rawSignal = engine.signal<number>(0, 'raw')

    const throttled = withThrottleComputed(
      engine,
      () => rawSignal.value,
      { limit: 1000 }
    )

    rawSignal.value = 1
    await vi.advanceTimersByTimeAsync(0)
    expect(throttled.value).toBe(1)

    rawSignal.value = 99 // Хвост запланирован в таймаут
    await vi.advanceTimersByTimeAsync(0)

    // Уничтожаем затроттленный computed до истечения лимита времени
    throttled.destroy()

    // Прокручиваем время на 1 секунду вперед
    await vi.advanceTimersByTimeAsync(1000)

    // Так как метод destroy вызвал clearTimeout, отложенный хвост 99 полностью аннулирован!
    expect(throttled.value).toBe(1)
  })
})
