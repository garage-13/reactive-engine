import { describe, it, expect, vi } from 'vitest'
import * as engine from './core.global'

describe('BENCH COMPUTES INITIALIZATION', () => {

  it('БЕНЧМАРК-TDD #1: [Холостой прогрев] первый пулл-запрос асимметричного графа не должен приводить к избыточным вычислениям нод', () => {
    let computedCount = 0

    // Строим сложную асимметричную структуру, как в генераторе makeGraph бенчмарка
    const sourceA = engine.signal(1, 'sourceA')
    const sourceB = engine.signal(2, 'sourceB')

    // Узел 1 (Глубина +1)
    const c1 = engine.computed(() => {
      computedCount++
      return sourceA.value + 10
    }, 'c1')

    // Узел 2 (Глубина +2, зависит от c1 и sourceB)
    const c2 = engine.computed(() => {
      computedCount++
      return c1.value + sourceB.value
    }, 'c2')

    // Точка схождения (Fan-In), создающая асимметричный алмаз:
    // Зависит напрямую от корня sourceA и от глубокого узла c2
    const c3 = engine.computed(() => {
      computedCount++
      return sourceA.value + c2.value
    }, 'c3')

    // Имитируем стартовый прогрев бенчмарка (первый pull-запрос)
    const startSum = c3.value

    expect(startSum).toBe(14) // 1 + (1 + 10 + 2) = 14 — данные верны

    // 🔴 КРИТИЧЕСКИЙ ФЕЙЛ ЯДРА v2.7.0:
    // Каноничный pull-граф при первом запросе обязан вычислить каждую ноду строго по 1 разу (всего 3 вызова).
    // Но рантайм v2.7.0 из-за отсутствия топологической сортировки на pull-фазе выполнит больше вызовов!
    // Именно этот избыточный стартовый прогрев и накручивает счетчик бенчмарка до 40 вместо 22.
    expect(computedCount).toBe(3)
  })

  it('БЕНЧМАРК-TDD #2: вычисление computed-свойства должно реагировать на мутации корня после закрытия транзакции batch', () => {
    const s = engine.signal(2)
    const c = engine.computed(() => s.value * 2)
    const spy = vi.fn()

    engine.effect(() => {
      spy(c.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)

    engine.batch(() => {
      s.value = 3
    })

    expect(s.value).toBe(3)
    expect(c.value).toBe(6)
    expect(spy).toHaveBeenCalledTimes(2)
  })

})
