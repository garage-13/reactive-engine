import { describe, it, expect, vi } from 'vitest'
import { effect, effectScope, nextTick } from 'vue'
import { ReactiveEngine4Vue } from './ReactiveEngine4Vue'
import { AbstractService } from '../core'

class TestService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'test:vue:counter')

  public inc = () => {
    this.counter.value += 1
  }
}

describe('ReactiveEngine4Vue (Synchronous Flow)', () => {
  it('должен корректно обновлять Vue-реактивность при изменении сигнала', async () => {
    const engine = new ReactiveEngine4Vue()
    const service = engine.inject(TestService)

    const scope = effectScope()
    let vueCounterRef: any

    scope.run(() => {
      vueCounterRef = engine.use(service.counter)
    })

    expect(vueCounterRef.value).toBe(0)
    service.inc()

    await nextTick()
    expect(vueCounterRef.value).toBe(1)

    scope.stop()
  })

  it('должен интегрироваться с Vue-эффектами (computed/effect)', async () => {
    const engine = new ReactiveEngine4Vue()
    const service = engine.inject(TestService)

    const scope = effectScope()
    let vueCounterRef: any
    let sideEffectValue = 0

    scope.run(() => {
      vueCounterRef = engine.use(service.counter)

      effect(() => {
        sideEffectValue = vueCounterRef.value * 2
      })
    })

    expect(sideEffectValue).toBe(0)
    service.inc()

    await nextTick()
    expect(sideEffectValue).toBe(2)

    scope.stop()
  })

  it('должен автоматически вызывать функцию отписки при уничтожении контекста Vue (onScopeDispose)', async () => {
    const engine = new ReactiveEngine4Vue()
    const service = engine.inject(TestService)

    const mockUnsubscribe = vi.fn()
    const originalSubscribe = service.counter.subscribe.bind(service.counter)

    vi.spyOn(service.counter, 'subscribe').mockImplementation((cb) => {
      const realUnsubscribe = originalSubscribe(cb)
      return () => {
        mockUnsubscribe()
        realUnsubscribe()
      }
    })

    const scope = effectScope()

    scope.run(() => {
      engine.use(service.counter)
    })

    expect(service.counter.subscribe).toHaveBeenCalled()

    scope.stop()
    await nextTick()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('должен успешно синхронизировать мутации массивов в Сигнале через engine.use во Vue', async () => {
    const engine = new ReactiveEngine4Vue()
    const tagsSignal = engine.signal(['javascript'])

    const scope = effectScope()
    let vueTagsRef: any

    scope.run(() => {
      vueTagsRef = engine.use(tagsSignal)
    })

    expect(vueTagsRef.value.join(', ')).toBe('javascript')

    // Мутируем массив и меняем ссылку через спред для триггера shallowRef во Vue
    tagsSignal.value.push('typescript')
    tagsSignal.value = [...tagsSignal.value]

    await nextTick()
    expect(vueTagsRef.value.join(', ')).toBe('javascript, typescript')

    scope.stop()
  })

  it('должен автоматически триггерить Vue-эффекты при изменении computed-свойства ядра, зависящего от массива', async () => {
    const engine = new ReactiveEngine4Vue()
    const listSignal = engine.signal(['apple', 'banana', 'orange'])

    const longWords = engine.computed(() => {
      return listSignal.value.filter(word => word.length > 5)
    })

    const scope = effectScope()
    let vueComputedRef: any
    let resultString = ''

    scope.run(() => {
      vueComputedRef = engine.use(longWords)

      effect(() => {
        resultString = vueComputedRef.value.join('-')
      })
    })

    expect(resultString).toBe('banana-orange')

    listSignal.value.push('pineapple')
    listSignal.value = [...listSignal.value]

    await nextTick()
    expect(resultString).toBe('banana-orange-pineapple')

    scope.stop()
  })

  it('должен нативно синхронизировать деструктивные методы Proxy-массивов (.push, .splice) в reactive() напрямую во Vue', async () => {
    const engine = new ReactiveEngine4Vue()
    const state = engine.reactive({ todos: ['Купить молоко'] })
    const scope = effectScope()
    let vueStateRef: any
    let effectCalls = 0

    scope.run(() => {
      vueStateRef = engine.use(state)
      effect(() => {
        effectCalls++
        const _ = vueStateRef.value.todos.join(' | ')
      })
    })

    expect(effectCalls).toBe(1)

    // В синхронном ядре для склеивания мутаций Proxy используем транзакцию батча
    engine.batch(() => {
      state.todos.push('Помыть кота')
      state.todos.push('Написать тесты')
      state.todos.splice(1, 1)
    })

    await nextTick()
    expect(effectCalls).toBe(2) // Ровно 1 дополнительный ререндер!
    scope.stop()
  })
})
