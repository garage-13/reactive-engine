import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveValue } from './useReactiveValue'
// Импортируем асингулярный адаптер автоматического батчинга микрозадач
import { ReactiveEngine4ReactAutomatic as ReactiveEngine } from '../../ReactiveEngine4React'

describe('useReactiveValue: Работа с массивами и Proxy (Automatic Engine)', () => {
  it('должен АВТОМАТИЧЕСКИ извлекать массив из Сигнала ядра и обновлять стейт через микрозадачу', async () => {
    const engine = new ReactiveEngine()
    const tagsSignal = engine.signal(['javascript'])

    const { result } = renderHook(() => {
      const tags = useReactiveValue(tagsSignal)
      return tags.join(', ')
    })

    expect(result.current).toBe('javascript')

    await act(async () => {
      tagsSignal.value.push('typescript')
      // Для триггера shallow-сравнения внутри useSyncExternalStore в React 18
      // необходима смена ссылки, но микрозадача ядра выполнит Push автоматически!
      tagsSignal.value = [...tagsSignal.value]
      await Promise.resolve() // Даем прокрутиться микрозадаче ядра queueMicrotask
    })

    expect(result.current).toBe('javascript, typescript')
  })

  it('должен АВТОМАТИЧЕСКИ склеивать цепочки нативных Proxy-мутаций (.push, .splice) строго в 1 ререндер без engine.batch()', async () => {
    const engine = new ReactiveEngine()
    const state = engine.reactive({ todos: ['Задача 1'] })
    const renderSpy = vi.fn()

    const { result } = renderHook(() => {
      renderSpy()
      const reactiveState = useReactiveValue(state)
      return reactiveState.todos.join(' | ')
    })

    expect(result.current).toBe('Задача 1')
    renderSpy.mockClear()

    await act(async () => {
      // КИЛЛЕР-ФИЧА: Мутируем напрямую в голом коде без engine.batch()!
      // Благодаря forceUpdate([]) внутри useReactiveValue, барьер Object.is() React обходится нативно!
      state.todos.push('Задача 2')
      state.todos.push('Задача 3')
      state.todos.splice(1, 1) // удалили 'Задача 2'
      await Promise.resolve() // Даем аппаратному шедулеру ядра склеить вызовы
    })

    expect(result.current).toBe('Задача 1 | Задача 3')
    expect(renderSpy.mock.calls.length).toBe(1) // Строго один ререндер шаблона!
  })
})
