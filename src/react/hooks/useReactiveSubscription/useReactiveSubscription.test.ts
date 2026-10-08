import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveSubscription } from './useReactiveSubscription'
import { ReactiveEngine4React as ReactiveEngine } from '../../ReactiveEngine4React' // Укажите ваш правильный относительный путь

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
        // Возвращаем функцию отписки
        return () => {
          subscribers.delete(cb)
        }
      })
    }
  })

  it('должен успешно подписываться на сигнал при монтировании', () => {
    const callback = vi.fn()

    // Рендерим хук (useLayoutEffect сработает синхронно благодаря окружению тестирования)
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

    // Передаем в хук второй сигнал вместо первого
    rerender({ sig: mockSignal2 })

    // От первого сигнала должна была произойти отписка (коллекция подписчиков пуста)
    expect(subscribers.size).toBe(0)
    // На второй сигнал должна успешно сформироваться новая подписка
    expect(mockSignal2.subscribe).toHaveBeenCalledTimes(1)
    expect(subscribers2.size).toBe(1)
  })

  it('должен вызывать деструктор подписки при размонтировании (unmount) компонента', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useReactiveSubscription(mockSignal, callback))

    expect(subscribers.size).toBe(1)

    // Размонтируем компонент с хуком
    unmount()

    // Функция очистки должна удалять коллбек из подписчиков
    expect(subscribers.size).toBe(0)
  })

  it('должен вызывать callback при мутации массивов в Сигнале ядра при пинке сеттера', async () => {
    const engine = new ReactiveEngine()
    const tagsSignal = engine.signal(['javascript'])
    const callbackSpy = vi.fn()

    renderHook(() => useReactiveSubscription(tagsSignal, callbackSpy))

    // ИЗОЛИРУЕМ СТАРТОВЫЙ ВЫЗОВ: Метод .subscribe ядра синхронно вызывает колбэк при монтировании
    callbackSpy.mockClear()

    await act(async () => {
      // Нативно мутируем массив внутри сигнала и пинаем его сеттер
      tagsSignal.value.push('typescript')
      tagsSignal.value = tagsSignal.value

      // Проталкиваем асинхронный автобатчинг ядра
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    // Хук должен перехватить уведомление и дернуть коллбек на изменение состава
    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(tagsSignal.value).toEqual(['javascript', 'typescript'])
    await new Promise((r) => setImmediate(r))
  })

  it('должен автоматически триггерить callback при изменении computed-свойства, фильтрующего массив', async () => {
    const engine = new ReactiveEngine()
    const listSignal = engine.signal(['apple', 'banana', 'orange'])

    // Создаем computed для фильтрации длинных слов
    const longWords = engine.computed(() => {
      return listSignal.value.filter(word => word.length > 5)
    })

    const callbackSpy = vi.fn()
    renderHook(() => useReactiveSubscription(longWords, callbackSpy))

    // ИЗОЛИРУЕМ СТАРТОВЫЙ ВЫЗОВ: Сбрасываем стартовый вызов .subscribe
    callbackSpy.mockClear()

    await act(async () => {
      // Добавляем новый элемент и сбрасываем кэш компьютеда пинком сигнала
      listSignal.value.push('pineapple')
      listSignal.value = listSignal.value

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    // Коллбек успешно вызвался, а компьютед вернул свежие отфильтрованные данные
    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(longWords.value).toEqual(['banana', 'orange', 'pineapple'])
    await new Promise((r) => setImmediate(r))
  })

  it('должен нативно перехватывать деструктивные методы Proxy-массивов (.push, .splice) в reactive() через скрытый __subscribe', async () => {
    const engine = new ReactiveEngine()

    // Создаем реактивный Proxy-объект средствами адаптера
    const state = engine.reactive({
      todos: ['Задача 1']
    })

    const callbackSpy = vi.fn()
    renderHook(() => useReactiveSubscription(state as any, callbackSpy))

    // Изоляция стартового вызова: Сбрасываем синхронный прогревочный вызов эффекта ядра при монтировании подписки
    callbackSpy.mockClear()

    await act(async () => {
      // Множественные нативные мутации без spread-костылей
      state.todos.push('Задача 2')
      state.todos.push('Задача 3')
      state.todos.splice(1, 1) // удалили 'Задача 2'

      // Проталкиваем Proxy-автобатчинг ядра
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    // Проверяем: благодаря нашему скрытому __subscribe геттеру во фреймворк-версии движка,
    // множественные операции склеились в РОВНО 1 вызов callback для финального стейта!
    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(state.todos).toEqual(['Задача 1', 'Задача 3'])
    await new Promise((r) => setImmediate(r))
  })
})
