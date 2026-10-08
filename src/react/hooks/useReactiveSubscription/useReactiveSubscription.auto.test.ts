import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveSubscription } from './useReactiveSubscription'
// Импортируем автоматическую асинхронную версию движка
import { ReactiveEngine4ReactAutomatic as ReactiveEngine } from '../../ReactiveEngine4React'

describe('useReactiveSubscription (Automatic Engine)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  it('должен АВТОМАТИЧЕСКИ вызывать callback при мутации массивов в Сигнале без спред-костылей', async () => {
    const tagsSignal = engine.signal(['javascript'])
    const callbackSpy = vi.fn()

    renderHook(() => useReactiveSubscription(tagsSignal, callbackSpy))
    callbackSpy.mockClear()

    await act(async () => {
      tagsSignal.value.push('typescript')
      tagsSignal.value = tagsSignal.value // Нативная ссылка себе же, автобатчинг микрозадач ядра сам разбудит хук!
      await Promise.resolve()
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(tagsSignal.value).toEqual(['javascript', 'typescript'])
  })

  it('должен АВТОМАТИЧЕСКИ склеивать каскад нативных Proxy-мутаций (.push, .splice) строго в 1 вызов callback', async () => {
    const state = engine.reactive({
      todos: ['Задача 1']
    })

    const callbackSpy = vi.fn()
    renderHook(() => useReactiveSubscription(state as any, callbackSpy))
    callbackSpy.mockClear()

    await act(async () => {
      // КИЛЛЕР-ФИЧА: Мутируем напрямую в голом коде без engine.batch()!
      state.todos.push('Задача 2')
      state.todos.push('Задача 3')
      state.todos.splice(1, 1)
      await Promise.resolve() // Даем шедулеру микрозадач ядра отработать
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1) // Ровно 1 вызов на выходе!
    expect(state.todos).toEqual(['Задача 1', 'Задача 3'])
  })
})
