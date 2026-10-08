import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
// Импортируем автоматическую версию фреймворк-адаптера Vue
import { ReactiveEngine4VueAutomatic as ReactiveEngine } from '../ReactiveEngine4Vue'
import { useReactiveValue } from './useReactiveValue'

describe('useReactiveValue Composable (Vue 3 — Automatic Async Flow)', () => {
  const createEngine = () => new ReactiveEngine({ logger: { isEnabled: false } })

  it('должен АВТОМАТИЧЕСКИ склеивать нативные Proxy-мутации массива (.push, .splice) строго в 1 ререндер DOM без engine.batch()', async () => {
    const engine = createEngine()
    const state = engine.reactive({
      todos: ['Task 1']
    }, 'test:reactive:todos')

    let renderCount = 0

    const TestComponent = defineComponent({
      setup() {
        const reactiveState = useReactiveValue(state)
        return () => {
          renderCount++
          return h('div', { id: 'output' }, reactiveState.value.todos.join(' | '))
        }
      }
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.find('#output').text()).toBe('Task 1')
    expect(renderCount).toBe(1)

    renderCount = 0

    // КИЛЛЕР-ФИЧА: Множественные нативные мутации без иммутабельных оберток и БЕЗ engine.batch()!
    state.todos.push('Task 2')
    state.todos.push('Task 3')
    state.todos.splice(1, 1) // удалили 'Task 2'

    // Даем шедулеру ядра собрать микрозадачи queueMicrotask и прогнать эффекты
    await Promise.resolve()
    // Даем планировщику Vue время обновить DOM-шаблон
    await nextTick()

    // Проверяем финальное состояние данных на экране
    expect(wrapper.find('#output').text()).toBe('Task 1 | Task 3')

    // Аппаратный автобатчинг сработал безупречно: произошел строго 1 ререндер!
    expect(renderCount).toBe(1)
  })
})
