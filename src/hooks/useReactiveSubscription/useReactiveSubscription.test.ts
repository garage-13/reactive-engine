import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveSubscription } from './useReactiveSubscription'

describe('useReactiveSubscription', () => {
  // Фейковый объект сигнала для изоляции тестов от самого ядра
  let mockSignal: { value: number; subscribe: any }
  let subscribers: Set<(val: number) => void>;

  beforeEach(() => {
    subscribers = new Set()

    // Эмулируем контракт Signal (метод subscribe и свойство value)
    mockSignal = {
      value: 10,
      subscribe: vi.fn((cb: (val: number) => void) => {
        subscribers.add(cb);
        // Возвращаем функцию отписки
        return () => {
          subscribers.delete(cb)
        }
      })
    }
  })

  it('должен успешно подписываться на сигнал при монтировании', () => {
    const callback = vi.fn()

    // Рендерим хук
    renderHook(() => useReactiveSubscription(mockSignal, callback))

    // Проверяем, что метод subscribe у сигнала был вызван ровно 1 раз
    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)
  })

  it('должен триггерить callback при оповещении от подписки', () => {
    const callback = vi.fn()
    renderHook(() => useReactiveSubscription(mockSignal, callback))

    // Имитируем изменение сигнала внутри ядра и вызов всех подписчиков
    act(() => {
      subscribers.forEach(cb => cb(20))
    })

    // Коллбек должен вызваться с новым значением
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(20)
  })

  it('НЕ должен переподписываться на сигнал, если изменилась только ссылка на callback', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    // Рендерим хук с первым коллбеком
    const { rerender } = renderHook(
      ({ cb }) => useReactiveSubscription(mockSignal, cb),
      { initialProps: { cb: callback1 } }
    )

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    // Перерендериваем хук с абсолютно новым коллбеком (имитируем изменение ссылки)
    rerender({ cb: callback2 })

    // Метод subscribe НЕ должен вызываться повторно, так как ref внутри хука защищает от этого
    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    // Проверяем, что при вызове сигнала сработает именно НОВЫЙ коллбек
    act(() => {
      subscribers.forEach(cb => cb(30))
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledWith(30)
  })

  it('должен отписываться от старого сигнала, если передан совершенно другой объект сигнала', () => {
    const callback = vi.fn()

    const mockSignal2 = {
      value: 100,
      subscribe: vi.fn(() => () => { })
    }

    const { rerender } = renderHook(
      ({ sig }) => useReactiveSubscription(sig, callback),
      { initialProps: { sig: mockSignal } }
    )

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    // Передаем в хук второй сигнал вместо первого
    rerender({ sig: mockSignal2 })

    // От первого сигнала должна была произойти отписка (коллекция подписчиков пуста)
    expect(subscribers.size).toBe(0)
    // На второй сигнал должна успешно сформироваться новая подписка
    expect(mockSignal2.subscribe).toHaveBeenCalledTimes(1)
  });

  it('должен вызывать деструктор подписки при размонтировании (unmount) компонента', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useReactiveSubscription(mockSignal, callback))

    expect(subscribers.size).toBe(1)

    // Размонтируем компонент с хуком
    unmount()

    // Функция очистки должна удалять коллбек из подписчиков
    expect(subscribers.size).toBe(0)
  })
})
