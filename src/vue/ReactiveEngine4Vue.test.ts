import { describe, it, expect, vi } from 'vitest'
import { effect, effectScope, nextTick } from 'vue'
import { ReactiveEngine4Vue } from './ReactiveEngine4Vue'
import { AbstractService } from '../core'

class TestService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'test:vue:counter');

  public inc = () => {
    this.counter.value += 1
  }
}

describe('ReactiveEngine4Vue', () => {
  it('должен корректно обновлять Vue-реактивность при изменении сигнала', async () => {
    const engine = new ReactiveEngine4Vue()
    const service = engine.inject(TestService)

    // Инициализируем область видимости Vue, чтобы getCurrentScope() сработал внутри .use()
    const scope = effectScope()
    let vueCounterRef: any

    scope.run(() => {
      vueCounterRef = engine.use(service.counter)
    })

    expect(vueCounterRef.value).toBe(0)
    service.inc()

    // Даем Vue время применить изменения в реактивном графе
    await nextTick()
    expect(vueCounterRef.value).toBe(1)

    // Чистим скоуп после завершения теста
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

      // Создаем Vue-эффект внутри активного скоупа
      effect(() => {
        sideEffectValue = vueCounterRef.value * 2
      })
    })

    expect(sideEffectValue).toBe(0)
    service.inc()

    // Ждем выполнения асинхронного Vue-эффекта
    await nextTick()
    expect(sideEffectValue).toBe(2)

    scope.stop()
  })

  it('должен автоматически вызывать функцию отписки при уничтожении контекста Vue (onScopeDispose)', () => {
    const engine = new ReactiveEngine4Vue()
    const service = engine.inject(TestService)

    const mockUnsubscribe = vi.fn()
    const originalSubscribe = service.counter.subscribe.bind(service.counter)

    vi.spyOn(service.counter, 'subscribe').mockImplementation((cb) => {
      originalSubscribe(cb)
      return mockUnsubscribe
    })

    const scope = effectScope()

    scope.run(() => {
      engine.use(service.counter)
    })

    expect(service.counter.subscribe).toHaveBeenCalled()

    // Останавливаем область видимости — это гарантированно вызовет onScopeDispose
    scope.stop()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
