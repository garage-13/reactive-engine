import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactiveValue } from './useReactiveValue'
import { useReactiveValue0 } from '../useReactiveValue0'
import { ReactiveEngine4React } from '../../ReactiveEngine4React' // Укажите правильный относительный путь

const runAutoCleanupTests = (hookName: string, hookFn: any) => {
  describe(`Авто-очистка под капотом: ${hookName}`, () => {

    it('должен гарантированно вызывать метод .destroy() при размонтировании, ОДНАКО только для ленивых фабрик', async () => {
      const destroySpy = vi.fn()
      const mockReactiveItem = {
        value: 'factory_computed',
        subscribe: vi.fn(() => () => { }),
        destroy: destroySpy
      }

      const { unmount } = renderHook(() => hookFn(() => mockReactiveItem))
      unmount()

      await vi.waitFor(() => {
        expect(destroySpy).toHaveBeenCalledTimes(1)
      })
    })

    it('КРИТИЧЕСКИЙ ТЕСТ: НЕ должен вызывать метод .destroy() для общих глобальных сигналов', async () => {
      const globalDestroySpy = vi.fn()
      const mockGlobalSignal = {
        value: 'global_shared_state',
        subscribe: vi.fn(() => () => { }),
        destroy: globalDestroySpy
      }

      const { unmount } = renderHook(() => hookFn(mockGlobalSignal))
      unmount()

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(globalDestroySpy).not.toHaveBeenCalled()
    })
  })
}

describe('Интеграционные тесты авто-очистки памяти', () => {
  runAutoCleanupTests('React 18+ (useSyncExternalStore)', useReactiveValue)
  runAutoCleanupTests('React 16.8+ (useState + useEffect)', useReactiveValue0)
})

describe('useReactiveValue: Работа с массивами и Proxy-объектами', () => {

  it('должен корректно извлекать массив из Сигнала ядра и обновлять компонент при смене ссылок', async () => {
    const engine = new ReactiveEngine4React()
    const tagsSignal = engine.signal(['javascript'])

    const { result } = renderHook(() => {
      const tags = useReactiveValue(tagsSignal)
      return tags.join(', ')
    })

    expect(result.current).toBe('javascript')

    await act(async () => {
      // Мутируем массив и прокидываем спред-оператор для триггераuseSyncExternalStore
      tagsSignal.value.push('typescript')
      tagsSignal.value = [...tagsSignal.value]

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    expect(result.current).toBe('javascript, typescript')
  })

  it('должен автоматически ререндерить компонент при изменении computed-цепочки, фильтрующей массив', async () => {
    const engine = new ReactiveEngine4React()
    const listSignal = engine.signal(['apple', 'banana', 'orange'])

    const longWords = engine.computed(() => {
      return listSignal.value.filter(word => word.length > 5)
    })

    const { result } = renderHook(() => {
      const filteredList = useReactiveValue(longWords)
      return filteredList.join('-')
    })

    expect(result.current).toBe('banana-orange')

    await act(async () => {
      listSignal.value.push('pineapple')
      listSignal.value = [...listSignal.value]

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    expect(result.current).toBe('banana-orange-pineapple')
  })

  it('должен нативно трекать деструктивные методы Proxy-массивов (.push, .splice) в reactive() без any и костылей', async () => {
    const engine = new ReactiveEngine4React()

    // Создаем честный реактивный объект через Proxy-адаптер React
    const state = engine.reactive({
      todos: ['Задача 1']
    })

    const renderSpy = vi.fn()

    const { result } = renderHook(() => {
      renderSpy()
      const reactiveState = useReactiveValue(state)
      return reactiveState.todos.join(' | ')
    })

    expect(result.current).toBe('Задача 1')

    // Сбрасываем счетчик вызовов Strict Mode перед проверкой автобатчинга
    renderSpy.mockClear()

    await act(async () => {
      // Настоящие мутации без иммутабельных оберток!
      state.todos.push('Задача 2')
      state.todos.push('Задача 3')
      state.todos.splice(1, 1) // удалили 'Задача 2'

      // Проталкиваем Proxy-автобатчинг микрозадач ядра
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    })

    // Благодаря нашему __subscribe и локальному forceUpdate,
    // изменения склеились в РОВНО 1 дополнительный ререндер для финального состояния!
    expect(result.current).toBe('Задача 1 | Задача 3')
    expect(renderCountSpy(renderSpy)).toBe(1)
  })
})

// Хелпер для подсчета вызовов в Strict Mode окружении Vitest
function renderCountSpy(spy: any) {
  return spy.mock.calls.length
}
