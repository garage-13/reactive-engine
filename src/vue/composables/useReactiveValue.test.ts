import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick, effectScope } from 'vue'
import { mount } from '@vue/test-utils'
import { ReactiveEngine4Vue as ReactiveEngine } from '../ReactiveEngine4Vue'
import { useReactiveValue } from './useReactiveValue'

describe('useReactiveValue Composable (Vue 3 — Synchronous Flow)', () => {
  const createEngine = () => new ReactiveEngine()

  it('должен корректно считывать стартовое значение сигнала ядра', () => {
    const engine = createEngine()
    const signal = engine.signal(42, 'test:signal')

    const TestComponent = defineComponent({
      setup() {
        const state = useReactiveValue(signal)
        return () => h('div', { id: 'output' }, state.value)
      }
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.find('#output').text()).toBe('42')
  })

  it('должен принудительно обновлять DOM при изменении значения в ядре (Push)', async () => {
    const engine = createEngine()
    const signal = engine.signal('initial', 'test:signal')

    const TestComponent = defineComponent({
      setup() {
        const state = useReactiveValue(signal)
        return () => h('div', { id: 'output' }, state.value)
      }
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.find('#output').text()).toBe('initial')

    signal.value = 'updated'

    await nextTick()
    expect(wrapper.find('#output').text()).toBe('updated')
  })

  it('должен автоматически отписываться от сигнала при размонтировании (unmount) компонента', () => {
    const engine = createEngine()
    const signal = engine.signal(100, 'test:signal')

    const unsubscribeSpy = vi.fn()
    const originalSubscribe = signal.subscribe.bind(signal)
    signal.subscribe = (cb: any) => {
      const unsub = originalSubscribe(cb)
      return () => {
        unsub()
        unsubscribeSpy()
      }
    }

    const TestComponent = defineComponent({
      setup() {
        useReactiveValue(signal)
        return () => h('div')
      }
    })

    const wrapper = mount(TestComponent)
    expect(unsubscribeSpy).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('должен успешно работать и отписываться внутри независимого EffectScope (вне компонентов)', () => {
    const engine = createEngine()
    const signal = engine.signal('scope-test', 'test:signal')

    let stateRef: any = null
    const scope = effectScope()

    scope.run(() => {
      stateRef = useReactiveValue(signal)
    })

    expect(stateRef.value).toBe('scope-test')

    scope.stop()

    signal.value = 'dead-mutation'
    expect(stateRef.value).toBe('scope-test')
  })

  it('БЕЗОПАСНОСТЬ SSR: не должен создавать подписку, если вызван в режиме Node.js сервера', () => {
    const engine = createEngine()
    const signal = engine.signal('ssr-value', 'test:signal')
    const subscribeSpy = vi.spyOn(signal, 'subscribe')

    const originalWindow = global.window
    vi.stubGlobal('window', undefined)

    const state = useReactiveValue(signal)

    expect(state.value).toBe('ssr-value')
    expect(subscribeSpy).not.toHaveBeenCalled()

    vi.stubGlobal('window', originalWindow)
  })

  it('должен обновлять DOM-дерево при мутации массивов в Сигнале ядра', async () => {
    const engine = createEngine()
    const tagsSignal = engine.signal(['js', 'ts'], { name: 'test:tags' })

    const TestComponent = defineComponent({
      setup() {
        const tags = useReactiveValue(tagsSignal)
        return () => h('ul', { id: 'list' }, tags.value.map(tag => h('li', tag)))
      }
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.find('#list').text()).toContain('js')
    expect(wrapper.find('#list').text()).toContain('ts')

    // В синхронном режиме меняем ссылку через спред для триггера shallowRef во Vue
    tagsSignal.value.push('vue')
    tagsSignal.value = [...tagsSignal.value]

    await nextTick()
    expect(wrapper.find('#list').text()).toContain('vue')
  })

  it('должен автоматически перерисовывать DOM-дерево при изменении computed-свойства, зависящего от массива', async () => {
    const engine = createEngine()
    const listSignal = engine.signal(['apple', 'banana', 'orange'])

    const longWords = engine.computed(() => {
      return listSignal.value.filter(word => word.length > 5)
    }, 'test:computed:longWords')

    const TestComponent = defineComponent({
      setup() {
        const filteredList = useReactiveValue(longWords)
        return () => h('div', { id: 'output' }, filteredList.value.join('-'))
      }
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.find('#output').text()).toBe('banana-orange')

    listSignal.value.push('pineapple')
    listSignal.value = [...listSignal.value]

    await nextTick()
    expect(wrapper.find('#output').text()).toBe('banana-orange-pineapple')
  })

  it('должен нативно отслеживать деструктивные методы Proxy-массивов (.push, .splice) и делать ровно 1 ререндер DOM', async () => {
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

    // В строго синхронном ядре склеиваем мутации Proxy через явный batch
    engine.batch(() => {
      state.todos.push('Task 2')
      state.todos.push('Task 3')
      state.todos.splice(1, 1)
    })

    await nextTick()

    expect(wrapper.find('#output').text()).toBe('Task 1 | Task 3')
    expect(renderCount).toBe(1)
  })
})
