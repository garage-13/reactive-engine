import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('⚛️ Reactive Framework Test Suite — Пакет P2 (Интеграционные бенчмарки)', () => {

  test('#34: pruning stops at first unchanged node', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // b зажимает значение a в диапазоне 0 или 1
    const b = engine.computed(() => (a.value > 0 ? 1 : 0))
    const c = engine.computed(() => b.value + 1)

    const spy = vi.fn()
    engine.effect(() => {
      spy(c.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(1) // b = 0, c = 1

    // Первый шаг: b меняется с 0 на 1. Эффект должен сработать.
    spy.mockClear()
    a.value = 5
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(2) // b = 1, c = 2

    // Второй шаг (критический): b остается равным 1!
    // Дальнейшее распространение (propagation) ОБЯЗАНО остановиться на узле b.
    spy.mockClear()
    a.value = 10
    expect(spy).not.toHaveBeenCalled() // c не должен пересчитываться, эффект молчит
  })

  test('#169: live pruning: effect not re-run when intermediate computed returns same', () => {
    const engine = new ReactiveEngineCore()
    const s = engine.signal(1)

    const c1 = engine.computed(() => s.value * 2)
    // c2 всегда возвращает константу 5, независимо от изменений c1
    const c2 = engine.computed(() => {
      const _ = c1.value
      return 5
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(c2.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(5)

    // Мутируем корень. c1 изменится, но c2 вернет то же самое значение (5).
    // Живая обрезка графа должна предотвратить повторный вызов эффекта.
    spy.mockClear()
    s.value = 2
    expect(spy).not.toHaveBeenCalled()
  })

  test('#220: computed same object reference — no downstream propagation', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // Постоянная ссылка на один и тот же объект
    const staticObj = { key: 'stable' }

    const b = engine.computed(() => {
      const _ = a.value
      return staticObj
    })

    const c = engine.computed(() => {
      return { data: b.value }
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(c.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)

    // Мутируем корень. b перезапустится, но вернет ту же самую объектную ссылку staticObj.
    // Граф обязан заблокировать downstream-уведомления, так как Object.is(old, new) истинен.
    spy.mockClear()
    a.value = 1
    expect(spy).not.toHaveBeenCalled()
  })

  test('#P2-4 (ex-#P2-1): сквозная изоляция транзакций batch внутри глубоко вложенных untrack', () => {
    const engine = new ReactiveEngineCore()
    const trigger = engine.signal(0)
    const spy = vi.fn()

    engine.effect(() => {
      spy(trigger.value)
    })

    engine.untrack(() => {
      engine.batch(() => {
        trigger.value = 1
        trigger.value = 2
      })
    })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith(2)
  })

  test('#P2-5 (ex-#P2-2): каскадное динамическое переключение ветвей (Conditional Evaluation) повышенной сложности', () => {
    const engine = new ReactiveEngineCore()
    const switchA = engine.signal(true)
    const switchB = engine.signal(true)
    const data = engine.signal('init')

    const spy = vi.fn()

    const computedChild = engine.computed(() => {
      if (!switchB.value) return 'branch-b-closed'
      return data.value
    })

    engine.effect(() => {
      if (switchA.value) {
        spy(computedChild.value)
      } else {
        spy('branch-a-closed')
      }
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith('init')

    switchA.value = false
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith('branch-a-closed')

    spy.mockClear()
    data.value = 'mutated-data'
    expect(spy).not.toHaveBeenCalled()
  })
})
