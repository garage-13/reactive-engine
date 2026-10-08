import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveSubscription } from './useReactiveSubscription'
import { ReactiveEngine4React as ReactiveEngine } from '../../ReactiveEngine4React'

describe('useReactiveSubscription', () => {
  // Фейковый объект сигнала для изоляции базовых тестов от самого ядра
  let mockSignal: { value: number; subscribe: any }
  let subscribers: Set<(val: number) => void>

  beforeEach(() => {
    subscribers = new Set()

    // Эмулируем контракт Signal (метод subscribe и свойство value)
    mockSignal = {
      value: 10,
      subscribe: vi.fn((cb: (val: number) => void) => {
        subscribers.add(cb)
        return () => {
          subscribers.delete(cb)
        }
      })
    }
  })

  it('должен успешно подписываться на сигнал при монтировании', () => {
    const callback = vi.fn()

    renderHook(() => useReactiveSubscription(mockSignal, callback))

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)
  })

  it('должен триггерить callback при оповещении от подписки', () => {
    const callback = vi.fn()
    renderHook(() => useReactiveSubscription(mockSignal, callback))

    act(() => {
      subscribers.forEach(cb => cb(20))
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(20)
  })

  it('НЕ должен переподписываться на сигнал, если изменилась только ссылка на callback', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const { rerender } = renderHook(
      ({ cb }) => useReactiveSubscription(mockSignal, cb),
      { initialProps: { cb: callback1 } }
    )

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    rerender({ cb: callback2 })

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    act(() => {
      subscribers.forEach(cb => cb(30))
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledWith(30)
  })

  it('должен отписываться от старого сигнала, если передан совершенно другой объект сигнала', () => {
    const callback = vi.fn()
    const subscribers2 = new Set<(val: number) => void>()

    const mockSignal2 = {
      value: 100,
      subscribe: vi.fn((cb: (val: number) => void) => {
        subscribers2.add(cb)
        return () => {
          subscribers2.delete(cb)
        }
      })
    }

    const { rerender } = renderHook(
      ({ sig }) => useReactiveSubscription(sig, callback),
      { initialProps: { sig: mockSignal } }
    )

    expect(mockSignal.subscribe).toHaveBeenCalledTimes(1)

    rerender({ sig: mockSignal2 })

    expect(subscribers.size).toBe(0)
    expect(mockSignal2.subscribe).toHaveBeenCalledTimes(1)
    expect(subscribers2.size).toBe(1)
  })

  it('должен вызывать деструктор подписки при размонтировании (unmount) компонента', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useReactiveSubscription(mockSignal, callback))

    expect(subscribers.size).toBe(1)

    unmount()

    expect(subscribers.size).toBe(0)
  })

  it('должен вызывать callback при мутации массивов в Сигнале ядра', () => {
    const engine = new ReactiveEngine()
    const tagsSignal = engine.signal(['javascript'])
    const callbackSpy = vi.fn()

    renderHook(() => useReactiveSubscription(tagsSignal, callbackSpy))
    callbackSpy.mockClear()

    act(() => {
      tagsSignal.value.push('typescript')
      // ИСПРАВЛЕНО: для триггера shallow-сравнения стейта внутри хуков React 18,
      // использующих useState/useEffect, необходима смена ссылки через спред-оператор
      tagsSignal.value = [...tagsSignal.value]
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(tagsSignal.value).toEqual(['javascript', 'typescript'])
  })

  it('должен автоматически триггерить callback при изменении computed-свойства, фильтрующего массив', () => {
    const engine = new ReactiveEngine()
    const listSignal = engine.signal(['apple', 'banana', 'orange'])

    const longWords = engine.computed(() => {
      return listSignal.value.filter(word => word.length > 5)
    })

    const callbackSpy = vi.fn()
    renderHook(() => useReactiveSubscription(longWords, callbackSpy))
    callbackSpy.mockClear()

    act(() => {
      listSignal.value.push('pineapple')
      listSignal.value = [...listSignal.value] // Спред для пробития React useState барьера
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(longWords.value).toEqual(['banana', 'orange', 'pineapple'])
  })

  it('должен нативно перехватывать деструктивные методы Proxy-массивов (.push, .splice) в reactive() ровно в 1 вызов', () => {
    const engine = new ReactiveEngine()

    const state = engine.reactive({
      todos: ['Задача 1']
    })

    const callbackSpy = vi.fn()
    renderHook(() => useReactiveSubscription(state as any, callbackSpy))
    callbackSpy.mockClear()

    act(() => {
      // Так как ядро строго синхронное, для атомарной склейки нескольких мутаций
      // Proxy в один вызов callback мы используем транзакцию engine.batch
      engine.batch(() => {
        state.todos.push('Задача 2')
        state.todos.push('Задача 3')
        state.todos.splice(1, 1)
      })
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(state.todos).toEqual(['Задача 1', 'Задача 3'])
  })
})
