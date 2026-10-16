import { describe, it, expect } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('Advanced: Static Graph Layering // Тест эмулирует многослойные статические графы, где сбои кэширования приводят к расхождению финальной суммы (ошибки вида expected 6 to deeply equal 16)', () => {
  it('correctly propagates values across deep computed layers', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    // Инициализируем изолированный мини-граф
    const s1 = engine.signal(2)
    const s2 = engine.signal(1)

    // Слой 1
    const c1 = engine.computed(() => s1.value + s2.value) // 3
    const c2 = engine.computed(() => s2.value * 2)        // 2

    // Слой 2 (Финальный агрегатор)
    const total = engine.computed(() => c1.value * 2 + c2.value) // 3*2 + 2 = 8

    expect(total.value).toBe(8)

    // Имитируем батч обновления как в runGraph
    engine.batch(() => {
      s1.value = 4 // c1 станет 5, c2 останется 2
    })

    // Ожидаем: 5*2 + 2 = 12
    expect(total.value).toBe(12)
  })
})
