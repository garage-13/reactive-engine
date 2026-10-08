import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState, useEffect } from 'react'
import { renderHook, act } from '@testing-library/react'
import { ReactiveEngine4React as ReactiveEngine } from './ReactiveEngine4React'

describe('ReactiveEngine (React)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('React Adapters (engine.use)', () => {
    it('должен выбрасывать ошибку, если адаптеры React не установлены', () => {
      const engineWithoutAdapters = new ReactiveEngine()
      // Принудительно зануляем адаптеры для проверки исключения
      engineWithoutAdapters.setReactAdapters(null as any, null as any)

      const sig = engineWithoutAdapters.signal(0)

      // Проверяем, что вызов метода .use() принудительно и синхронно падает
      expect(() => {
        engineWithoutAdapters.use(sig)
      }).toThrow()
    })

    it('должен успешно синхронизировать сигнал с хуками React', () => {
      const sig = engine.signal<string>('hello')

      const { result } = renderHook(() => engine.use(sig))
      expect(result.current).toBe('hello')

      act(() => {
        sig.value = 'world'
      })

      expect(result.current).toBe('world')
    })

    it('должен успешно синхронизировать reactive-объект напрямую через engine.use без computed-мостов', () => {
      const formState = engine.reactive({
        user: {
          name: 'Иван',
          age: 25
        },
        status: 'pending'
      })

      const { result } = renderHook(() => {
        const state = engine.use(formState)
        return {
          displayName: state.user.name,
          displayStatus: state.status
        }
      })

      expect(result.current.displayName).toBe('Иван')
      expect(result.current.displayStatus).toBe('pending')

      act(() => {
        formState.user.name = 'Алексей'
      })

      expect(result.current.displayName).toBe('Алексей')
      expect(result.current.displayStatus).toBe('pending')
    })

    it('должен автоматически ререндерить компонент при изменении computed-свойства, зависящего от массива', () => {
      const listSignal = engine.signal(['apple', 'banana', 'orange'])

      const longWords = engine.computed(() => {
        return listSignal.value.filter(word => word.length > 5)
      })

      const { result } = renderHook(() => {
        const filteredList = engine.use(longWords)
        return filteredList.join('-')
      })

      expect(result.current).toBe('banana-orange')

      act(() => {
        listSignal.value.push('pineapple')
        listSignal.value = [...listSignal.value] // Спред нужен строго для триггера shallow-сравнения в useState
      })

      expect(result.current).toBe('banana-orange-pineapple')
    })

    it('должен успешно синхронизировать мутации массивов в Сигнале через engine.use при пинке сеттера', () => {
      const tagsSignal = engine.signal(['javascript'])

      const { result } = renderHook(() => {
        engine.use(tagsSignal)
        return tagsSignal.value.join(', ')
      })

      expect(result.current).toBe('javascript')

      act(() => {
        tagsSignal.value.push('typescript')
        tagsSignal.value = [...tagsSignal.value] // Спред нужен строго для триггера shallow-сравнения в useState
      })

      expect(result.current).toBe('javascript, typescript')
    })

    it('должен нативно отслеживать деструктивные методы Proxy-массивов (.push, .splice) напрямую через engine.use ровно в 1 ререндер', () => {
      const state = engine.reactive({
        todos: ['Купить молоко']
      })

      const renderSpy = vi.fn()

      const { result } = renderHook(() => {
        renderSpy()
        const reactiveState = engine.use(state)
        return reactiveState.todos.join(' | ')
      })

      expect(result.current).toBe('Купить молоко')
      renderSpy.mockClear()

      act(() => {
        // Так как ядро строго синхронное, а в React-контексте мы убрали асинхронный микробатчинг,
        // для склеивания множественных нативных мутаций в один ререндер мы явно используем engine.batch()
        engine.batch(() => {
          state.todos.push('Помыть кота')
          state.todos.push('Написать тесты')
          state.todos.splice(1, 1) // удалили 'Помыть кота'
        })
      })

      expect(result.current).toBe('Купить молоко | Написать тесты')
      expect(renderSpy).toHaveBeenCalledTimes(1)
    })
  })
})
