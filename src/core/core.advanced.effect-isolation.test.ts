import { describe, it, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('Advanced: Effect Lifecycle and Isolation // Тест проверяет поведение планировщика эффектов при последовательных изменениях, воспроизводя сбой expected 4 to deeply equal 6 из секции эффектов', () => {
  it('should isolate side-effects and execute them appropriate number of times', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const s = engine.signal(1)
    const c = engine.computed(() => s.value * 2)

    const spy = vi.fn()

    engine.effect(() => {
      spy(c.value)
    })

    // Эффект должен сработать при создании
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(2)

    engine.batch(() => {
      s.value = 3
    })

    // После батча эффект должен выполниться повторно с новым значением
    expect(c.value).toBe(6)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith(6)
  })
})
