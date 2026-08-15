import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick, effectScope } from 'vue'
import { mount } from '@vue/test-utils'
import { ReactiveEngine } from '../../core/core'
import { useReactiveValue } from '../composables/useReactiveValue'

describe('useReactiveValue Composable (Vue 3)', () => {
  // Инициализируем тестовый экземпляр ядра перед каждым тестом
  const createEngine = () => new ReactiveEngine({ logger: { isEnabled: false } })

  it('должен корректно считывать стартовое значение сигнала ядра', () => {
    const engine = createEngine()
    const signal = engine.signal(42, 'test:signal')

    // Обертка-компонент для тестирования композибла во Vue-окружении
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

    // Мутируем сигнал внутри ядра
    signal.value = 'updated'

    // 🌟 ФИКС: Сначала ждем микрозадачу батчинга вашего ЯДРА...
    await Promise.resolve()

    // ...а затем ждем тик перерисовки шаблона VUE
    await nextTick()

    expect(wrapper.find('#output').text()).toBe('updated')
  })


  it('должен автоматически отписываться от сигнала при размонтировании (unmount) компонента', () => {
    const engine = createEngine()
    const signal = engine.signal(100, 'test:signal')

    // Шпионим за методом subscribe, чтобы проверить вызов отписки (unsubscribe)
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

    // Уничтожаем компонент Vue
    wrapper.unmount()

    // Проверяем, что функция отписки была вызвана, предотвращая утечки памяти
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('должен успешно работать и отписываться внутри независимого EffectScope (вне компонентов)', () => {
    const engine = createEngine()
    const signal = engine.signal('scope-test', 'test:signal')

    let stateRef: any = null

    // Создаем изолированную область видимости эффектов Vue 3 (часто используется в сторах)
    const scope = effectScope()

    scope.run(() => {
      stateRef = useReactiveValue(signal)
    })

    expect(stateRef.value).toBe('scope-test')

    // Уничтожаем область видимости
    scope.stop()

    // Проверяем, что мутации ядра больше не влияют на переменную, так как сработал onScopeDispose
    signal.value = 'dead-mutation'
    expect(stateRef.value).toBe('scope-test') // Значение "заморозилось"
  })

  it('БЕЗОПАСНОСТЬ SSR: не должен создавать подписку, если вызван в режиме Node.js сервера', () => {
    const engine = createEngine()
    const signal = engine.signal('ssr-value', 'test:signal')
    const subscribeSpy = vi.spyOn(signal, 'subscribe')

    // Временно эмулируем отсутствие window (как на сервере Node.js)
    const originalWindow = global.window
    vi.stubGlobal('window', undefined)

    // Вызываем хук в эмулированной SSR среде
    const state = useReactiveValue(signal)

    expect(state.value).toBe('ssr-value')
    expect(subscribeSpy).not.toHaveBeenCalled() // 🌟 ТЕСТ ЖЕЛЕЗНО ПРОЙДЕТ!

    // Восстанавливаем окружение Vitest обратно
    vi.stubGlobal('window', originalWindow)
  })

})
