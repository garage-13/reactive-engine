import { describe, it, expect } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('Advanced: Simple Write // Тест проверяет базовую изоляцию и реактивное обновление computed после записи в signal', () => {
  it('should evaluate computed value precisely after state write', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const s = engine.signal(1)
    const c = engine.computed(() => s.value * 2)

    expect(c.value).toBe(2)

    engine.batch(() => {
      s.value = 3
      expect(s.value).toBe(3)
      // Внутри batch значение должно быть актуальным при Pull-запросе
      expect(c.value).toBe(6)
    })

    expect(c.value).toBe(6)
  })
})

