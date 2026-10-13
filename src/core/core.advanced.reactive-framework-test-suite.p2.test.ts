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

  // =========================================================================
  // ⚡ ГРУППА: ЛЕНИВЫЙ БАТЧИНГ И ДИНАМИЧЕСКАЯ НЕДОСТИЖИМОСТЬ
  // =========================================================================

  test('#147: computed not recomputed in batch if dep reverts to original value', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    let computedRuns = 0
    const c = engine.computed(() => {
      computedRuns++
      return a.value * 2
    })

    // Прогреваем computed первичным чтением
    expect(c.value).toBe(0)
    expect(computedRuns).toBe(1)

    // Запускаем транзакцию с полным откатом (Net change = 0)
    engine.batch(() => {
      a.value = 5
      a.value = 0 // Значение полностью вернулось к исходному до закрытия батча
    })

    // Идеальный движок НЕ должен инвалидировать кэш и перезапускать computed!
    expect(c.value).toBe(0)
    expect(computedRuns).toBe(1) // Должно остаться строго 1 (холостой пересчет заблокирован)
  })

  test('#188: batch + dynamic deps: unnecessary recompute of unreachable branch avoided', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)

    let cRuns = 0
    const c = engine.computed(() => {
      cRuns++
      return b.value + 10
    })

    // Узел d читает узел c ТОЛЬКО когда a === 0
    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return a.value === 0 ? c.value : 999
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(d.value)
    })

    expect(spy).toHaveBeenCalledWith(10) // a=0 -> c=10 -> d=10
    expect(cRuns).toBe(1)
    expect(dRuns).toBe(1)

    spy.mockClear()

    // Внутри батча меняем а на 1 (что делает ветку c недостижимой) и одновременно меняем b
    engine.batch(() => {
      a.value = 1
      b.value = 5
    })

    // Так как после закрытия батча a === 1, узел d уходит в ветку 999.
    // Узел c становится полностью изолированным (unreachable).
    // Его функция вычисления НЕ ДОЛЖНА запускаться вообще!
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(999)
    expect(cRuns).toBe(1) // Сигнал b изменился, но ветка c мертва -> cRuns не должно расти!
  })

  test('#189: multi-signal change: topological ordering preserved and unreachable skipped', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)
    const c = engine.signal(0)

    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return c.value * 2
    })

    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      // Если a > 0, мы зависим от b и d. Если a <= 0, мы зависим ТОЛЬКО от b!
      return a.value > 0 ? b.value + d.value : b.value + 100
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(e.value)
    })

    expect(spy).toHaveBeenLastCalledWith(100) // a=0 -> b=0 + 100
    expect(dRuns).toBe(0) // d изначально вообще не читается, так как a <= 0
    expect(eRuns).toBe(1)

    spy.mockClear()

    // Внутри батча меняем b, но сохраняем a <= 0
    engine.batch(() => {
      b.value = 10
      c.value = 5 // c поменялся, но его потребитель d все еще находится в слепой зоне для e
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(110) // b=10 + 100
    expect(dRuns).toBe(0) // d по-прежнему недостижим и НЕ должен вычисляться!
  })

})
