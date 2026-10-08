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
      engineWithoutAdapters.setReactAdapters(null as any, null as any)

      const sig = engineWithoutAdapters.signal(0)

      expect(() => engineWithoutAdapters.use(sig)).toThrow(
        'this.reactAdapters.useState is not a function or its return value is not iterable'
      )
    })

    it('должен успешно синхронизировать сигнал с хуками React', async () => {
      engine.setReactAdapters(useState, useEffect)
      const sig = engine.signal<string>('hello')

      const { result } = renderHook(() => engine.use(sig))
      expect(result.current).toBe('hello')

      await act(async () => {
        sig.value = 'world'
        await new Promise((r) => setImmediate(r))
      })

      expect(result.current).toBe('world')
    })

    it('должен успешно синхронизировать reactive-объект напрямую через engine.use без computed-мостов', async () => {
      engine.setReactAdapters(useState, useEffect)

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

      await act(async () => {
        formState.user.name = 'Алексей'
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
      })

      expect(result.current.displayName).toBe('Алексей')
      expect(result.current.displayStatus).toBe('pending')

      await new Promise((r) => setImmediate(r))
    })

    describe('React Adapters (engine.use)', () => {

      it('должен автоматически ререндерить компонент при изменении computed-свойства, зависящего от массива', async () => {
        engine.setReactAdapters(useState, useEffect)

        const listSignal = engine.signal(['apple', 'banana', 'orange'])

        // Создаем зависимый компьютед для фильтрации длинных слов
        const longWords = engine.computed(() => {
          return listSignal.value.filter(word => word.length > 5)
        })

        const { result } = renderHook(() => {
          const filteredList = engine.use(longWords)
          return filteredList.join('-')
        })

        expect(result.current).toBe('banana-orange') // apple отфильтровался

        await act(async () => {
        // Добавляем новое длинное слово и пинаем сигнал
          listSignal.value.push('pineapple')
          listSignal.value = listSignal.value

          await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        })

        // Вычисляемое свойство синхронно инвалидировалось, а хук use спровоцировал ререндер
        expect(result.current).toBe('banana-orange-pineapple')
        await new Promise((r) => setImmediate(r))
      })

      it('должен успешно синхронизировать мутации массивов в Сигнале через engine.use при пинке сеттера', async () => {
        engine.setReactAdapters(useState, useEffect)

        // Инициализируем сигнал с массивом
        const tagsSignal = engine.signal(['javascript'])

        const { result } = renderHook(() => {
        // Достаем значение через use
          const tags = engine.use(tagsSignal)

          // Превращаем в строку для проверки в expect
          return tagsSignal.value.join(', ')
        })

        expect(result.current).toBe('javascript')

        await act(async () => {
        // Сначала мутируем данные
          tagsSignal.value.push('typescript')

          // Для интеграции с React-атомами (useState), чтобы пробить Object.is барьер фреймворка,
          // мы прокидываем новую ссылку через spread. Ядро примет мутацию, а React сделает честный ререндер!
          tagsSignal.value = [...tagsSignal.value]

          // Даем отработать асинхронной микрозадаче батчинга ядра
          await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        })

        // Теперь React гарантированно перерисует строку!
        expect(result.current).toBe('javascript, typescript')
        await new Promise((r) => setImmediate(r))
      })


      it('должен нативно отслеживать деструктивные методы Proxy-массивов (.push, .splice) напрямую через engine.use', async () => {
        engine.setReactAdapters(useState, useEffect)

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

        // Изоляция монтирования: Сбрасываем счетчик вызовов Strict Mode перед тестом батчинга!
        renderSpy.mockClear()

        await act(async () => {
        // Полностью мутабельный флоу без всяких spread-операторов
          state.todos.push('Помыть кота')
          state.todos.push('Написать тесты')
          state.todos.splice(1, 1) // удалили 'Помыть кота'

          // Наш новый Proxy-автобатчинг ядра заблокирует каскад forceUpdate
          await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        })

        // React-компонент должен перерисоваться строго РОВНО 1 РАЗ для финального стейта
        expect(result.current).toBe('Купить молоко | Написать тесты')
        expect(renderSpy).toHaveBeenCalledTimes(1)

        await new Promise((r) => setImmediate(r))
      })
    })
  })
})
