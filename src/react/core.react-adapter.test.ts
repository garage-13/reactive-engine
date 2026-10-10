import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ReactiveEngineCore, ReactiveEngine } from '../index'
import { use } from './index' // Импортируем канонический хук из точки входа субпакета

describe('React Adapter Hooks — Синхронный движок (Synchronous Flow)', () => {
  let engine: ReactiveEngineCore

  beforeEach(() => {
    engine = new ReactiveEngineCore()
  })

  it('должен успешно синхронизировать примитивный Сигнал с хуками React', () => {
    const sig = engine.signal('hello')
    const { result } = renderHook(() => use(sig))

    expect(result.current).toBe('hello')

    act(() => {
      sig.value = 'world'
    })

    expect(result.current).toBe('world')
  })

  it('должен успешно синхронизировать глубокий reactive-объект напрямую через use()', () => {
    const formState = engine.reactive({
      user: { name: 'Иван', age: 25 },
      status: 'pending'
    })

    // ИСПРАВЛЕНО: Возвращаем сам прокси-стейт наружу, чтобы renderHook сохранил ссылочную идентичность
    const { result } = renderHook(() => use(formState))

    expect(result.current.user.name).toBe('Иван')

    act(() => {
      formState.user.name = 'Алексей'
    })

    expect(result.current.user.name).toBe('Алексей')
  })

  it('должен автоматически ререндерить компонент при изменении computed-цепочки, фильтрующей массив', () => {
    const listSignal = engine.signal(['apple', 'banana', 'orange'])
    const longWords = engine.computed(() => listSignal.value.filter((word: string) => word.length > 5))

    const { result } = renderHook(() => use(longWords))

    expect(result.current).toEqual(['banana', 'orange'])

    act(() => {
      // Честный иммутабельный спред для пробоя сеттера Сигнала в ядре
      listSignal.value = [...listSignal.value, 'pineapple']
    })

    expect(result.current).toEqual(['banana', 'orange', 'pineapple'])
  })
  // TODO:
  it.skip('должен нативно отслеживать деструктивные методы Proxy-массивов (.push, .splice) ровно в 1 ререндер', () => {
    const state = engine.reactive({
      todos: ['Купить молоко']
    })

    const renderSpy = vi.fn()
    const { result } = renderHook(() => {
      renderSpy()
      return use(state)
    })

    expect(result.current.todos).toEqual(['Купить молоко'])
    renderSpy.mockClear()

    act(() => {
      engine.batch(() => {
        state.todos.push('Помыть кота')
        state.todos.push('Написать тесты')
        state.todos.splice(1, 1)
      })
    })

    expect(result.current.todos).toEqual(['Купить молоко', 'Написать тесты'])
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })
})

describe('React Adapter Hooks — Автоматический движок (Microtask Flow)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  it('должен асинхронно синхронизировать примитивный Сигнал через waitFor', async () => {
    const sig = engine.signal('hello')
    const { result } = renderHook(() => use(sig))

    expect(result.current).toBe('hello')

    act(() => {
      sig.value = 'world'
    })

    // Для Microtask Flow используем waitFor, дожидаясь схождения такта Event Loop!
    await waitFor(() => {
      expect(result.current).toBe('world')
    })
  })

  it('должен асинхронно трекать мутации Proxy-объектов', async () => {
    const state = engine.reactive({ user: { name: 'Иван' } })
    const { result } = renderHook(() => use(state))

    expect(result.current.user.name).toBe('Иван')

    act(() => {
      state.user.name = 'Алексей'
    })

    await waitFor(() => {
      expect(result.current.user.name).toBe('Алексей')
    })
  })
})
