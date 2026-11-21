import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('⚛️ Reactive Engine — Граф $bog_collider (Prune & Custom Equals)', () => {
  test('пропускает невостребованную ветку E и гасит пересчёт F при кастомном equals (3 вызова hard)', () => {
    const engine = new ReactiveEngineCore()
    const numbers = [0, 1, 2, 3, 4]
    const hardCalls: string[] = []
    const res: number[] = []

    const hard = (val: number, label: string): number => {
      hardCalls.push(label)
      return val + 10
    }

    const A = engine.signal(0, 'A')
    const B = engine.signal(0, 'B')

    const C = engine.computed(() => (A.value % 2) + (B.value % 2), 'C')

    // Передаём кастомный компаратор equals для массива объектов (как { equals } в Solid 2)
    const D = engine.computed(
      () => numbers.map((i) => ({ x: i + (A.value % 2) - (B.value % 2) })),
      {
        name: 'D',
        equals: (prev, next) =>
          prev.length === next.length &&
          prev.every((item, idx) => item.x === next[idx].x),
      }
    )

    const E = engine.computed(
      () => hard(C.value + A.value + D.value[0].x, 'E'),
      'E'
    )

    const F = engine.computed(
      () => hard(D.value[2].x || B.value, 'F'),
      'F'
    )

    // Когда C.value !== 0, ветка E не читается и не должна вычисляться
    const G = engine.computed(
      () => C.value + (C.value || E.value % 2) + D.value[4].x + F.value,
      'G'
    )

    const stopH = engine.effect(() => {
      res.push(hard(G.value, 'H'))
    }, 'H')

    const stopI = engine.effect(() => {
      res.push(G.value)
    }, 'I')

    const stopJ = engine.effect(() => {
      res.push(hard(F.value, 'J'))
    }, 'J')

    // Сбрасываем логи стартового прогрева графа
    hardCalls.length = 0
    res.length = 0

    // ШАГ 1: B = 1, A = 1
    // (1 % 2) - (1 % 2) === 0 -> содержимое D не изменилось -> equals гасит F!
    // C = 2 (истинно -> ветка E не востребована и пропускается!)
    // Считается только H!
    engine.batch(() => {
      B.value = 1
      A.value = 1
    })

    expect(hardCalls).toEqual(['H'])
    hardCalls.length = 0

    // ШАГ 2: A = 2, B = 2
    // (2 % 2) - (2 % 2) === 0 -> содержимое D не изменилось -> F снова не считается!
    // C = 0 (ложно -> G читает E -> считается E и H)
    engine.batch(() => {
      A.value = 2
      B.value = 2
    })

    expect(hardCalls).toEqual(['E', 'H'])

    // Итого за два шага ровно 3 вызова hard() (F, H + E, H) — на уровне $mol
    stopH()
    stopI()
    stopJ()
  })

  test('без кастомного equals сохраняет стандартную семантику Object.is (5 вызовов hard)', () => {
    const engine = new ReactiveEngineCore()
    const numbers = [0, 1, 2, 3, 4]
    const hardCalls: string[] = []

    const hard = (val: number, label: string): number => {
      hardCalls.push(label)
      return val + 10
    }

    const A = engine.signal(0)
    const B = engine.signal(0)

    const C = engine.computed(() => (A.value % 2) + (B.value % 2))
    const D = engine.computed(() =>
      numbers.map((i) => ({ x: i + (A.value % 2) - (B.value % 2) }))
    )
    const E = engine.computed(() => hard(C.value + A.value + D.value[0].x, 'E'))
    const F = engine.computed(() => hard(D.value[2].x || B.value, 'F'))
    const G = engine.computed(
      () => C.value + (C.value || E.value % 2) + D.value[4].x + F.value
    )

    const stopH = engine.effect(() => {
      hard(G.value, 'H')
    })
    const stopJ = engine.effect(() => {
      hard(F.value, 'J')
    })

    hardCalls.length = 0

    engine.batch(() => {
      B.value = 1
      A.value = 1
    })
    expect(hardCalls).toEqual(['F', 'H'])

    hardCalls.length = 0

    engine.batch(() => {
      A.value = 2
      B.value = 2
    })
    expect(hardCalls).toEqual(['F', 'E', 'H'])

    stopH()
    stopJ()
  })
})
