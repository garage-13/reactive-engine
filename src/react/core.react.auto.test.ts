import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState, useEffect } from 'react'
import { renderHook, act } from '@testing-library/react'
// Импортируем автоматическую версию для этого набора тестов
import { ReactiveEngine4ReactAutomatic as ReactiveEngine } from './ReactiveEngine4React'

describe('ReactiveEngine4ReactAutomatic (React)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('React Adapters (engine.use) — Асинхронный автобатчинг', () => {
    it('должен выбрасывать ошибку, если адаптеры React не установлены', () => {
      const engineWithoutAdapters = new ReactiveEngine()
      engineWithoutAdapters.setReactAdapters(null as any, null as any)
      const sig = engineWithoutAdapters.signal(0)

      expect(() => {
        engineWithoutAdapters.use(sig)
      }).toThrow()
    })

    it('должен успешно синхронизировать сигнал с хуками React через микрозадачу', async () => {
      const sig = engine.signal<string>('hello')

      const { result } = renderHook(() => engine.use(sig))
      expect(result.current).toBe('hello')

      // ИСПРАВЛЕНО: Переводим act на async и проталкиваем Event Loop
      await act(async () => {
        sig.value = 'world'
        await Promise.resolve() // Даем шедулеру ядра выполнить queueMicrotask!
      })

      expect(result.current).toBe('world')
    })

    it('должен успешно синхронизировать reactive-объект напрямую через engine.use без computed-мостов', async () => {
      const formState = engine.reactive({
        user: { name: 'Иван', age: 25 },
        status: 'pending'
      })

      const { result } = renderHook(() => {
        const state = engine.use(formState)
        return { displayName: state.user.name, displayStatus: state.status }
      })

      // ИСПРАВЛЕНО: Переводим act на async и проталкиваем Event Loop
      await act(async () => {
        formState.user.name = 'Алексей'
        await Promise.resolve()
      })

      expect(result.current.displayName).toBe('Алексей')
    })

    it('должен автоматически ререндерить компонент при изменении computed-свойства, зависящего от массива', async () => {
      const listSignal = engine.signal(['apple', 'banana', 'orange'])
      const longWords = engine.computed(() => listSignal.value.filter(word => word.length > 5))

      const { result } = renderHook(() => engine.use(longWords))

      expect(result.current.join('-')).toBe('banana-orange')

      // ИСПРАВЛЕНО: Переводим act на асингулярную модель и меняем ссылку массива через спред
      await act(async () => {
        listSignal.value.push('pineapple')
        listSignal.value = [...listSignal.value] // Спред пробивает барьер идентичности сигналов ядра!
        await Promise.resolve() // Даем шедулеру микрозадач ядра отработать flushEffects
      })

      expect(result.current.join('-')).toBe('banana-orange-pineapple')
    })


    it('должен успешно синхронизировать мутации массивов в Сигнале через engine.use при пинке сеттера', async () => {
      const tagsSignal = engine.signal(['javascript'])

      const { result } = renderHook(() => {
        engine.use(tagsSignal)
        return tagsSignal.value.join(', ')
      })

      // ИСПРАВЛЕНО: Переводим act на async и проталкиваем Event Loop
      await act(async () => {
        tagsSignal.value.push('typescript')
        tagsSignal.value = [...tagsSignal.value]
        await Promise.resolve()
      })

      expect(result.current).toBe('javascript, typescript')
    })

    it('должен нативно отслеживать деструктивные методы Proxy-массивов (.push, .splice) напрямую в 1 ререндер АВТОМАТИЧЕСКИ', async () => {
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

      // КИЛЛЕР-ФИЧА: Мы больше НЕ пишем тут engine.batch()!
      // Множественные мутации в голом коде склеятся аппаратно!
      await act(async () => {
        state.todos.push('Помыть кота')
        state.todos.push('Написать тесты')
        state.todos.splice(1, 1)
        await Promise.resolve() // Даем аппаратному батчингу отработать
      })

      expect(result.current).toBe('Купить молоко | Написать тесты')
      expect(renderSpy).toHaveBeenCalledTimes(1) // Строго один ререндер!
    })
  })
})
