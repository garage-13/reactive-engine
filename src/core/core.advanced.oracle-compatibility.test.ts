import { describe, it, expect } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('Oracle Compatibility: Diamond Topology & Side Writes', () => {
  it('handles diamond topology (2/3 leaves, #206) without redundant evaluations', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const root = engine.signal(1)
    const left = engine.computed(() => root.value * 2)
    const right = engine.computed(() => root.value * 3)

    let evalCount = 0
    const combined = engine.computed(() => {
      evalCount++
      return left.value + right.value
    })

    // Первая итерация: каскадный Pull-запрос вычисляет граф
    expect(combined.value).toBe(5)
    expect(evalCount).toBe(1)

    // Изменение root через batch обновляет combined ровно один раз
    engine.batch(() => {
      root.value = 2
    })

    expect(combined.value).toBe(10)
    expect(evalCount).toBe(2)
  })

  it('respects side-effect writes and Object.is equality semantics', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const base = engine.signal(10)
    const log: number[] = []

    const derived = engine.computed(() => {
      const val = base.value
      log.push(val)
      return val * 2
    })

    // Эффект подписывается на изменения через ленивый Pull-запрос
    engine.effect(() => {
      derived.value
    })

    expect(log).toEqual([10])

    // Запись того же значения (проверка Object.is) не сбрасывает кэш
    engine.batch(() => {
      base.value = 10
    })
    expect(log).toEqual([10])

    // Честная мутация инициирует корректный перерасчет
    engine.batch(() => {
      base.value = 20
    })
    expect(derived.value).toBe(40)
    expect(log).toEqual([10, 20])
  })
})
