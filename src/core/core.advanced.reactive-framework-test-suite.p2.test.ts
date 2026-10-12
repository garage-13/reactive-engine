import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('⚛️ Reactive Framework Test Suite — Пакет P2 (Интеграционные бенчмарки)', () => {
  test('#P2-1: сквозная изоляция транзакций batch внутри глубоко вложенных untrack', () => {
    const engine = new ReactiveEngineCore()
    const trigger = engine.signal(0)
    const spy = vi.fn()

    engine.effect(() => {
      spy(trigger.value)
    })

    // Проверяем, что изменения изолируются внутри untrack, но batch гарантирует атомарный flush на выходе
    engine.untrack(() => {
      engine.batch(() => {
        trigger.value = 1
        trigger.value = 2
      })
    })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith(2)
  })

  test('#P2-2: каскадное динамическое переключение ветвей (Conditional Evaluation) повышенной сложности', () => {
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

    // Отключаем ветку А — computedChild должен полностью потерять активного слушателя-эффекта
    switchA.value = false
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith('branch-a-closed')

    // Мутируем данные мёртвой ветки — эффект НЕ должен просыпаться (Lazy GC / Dynamic Cleanup)
    spy.mockClear()
    data.value = 'mutated-data'
    expect(spy).not.toHaveBeenCalled()
  })
})
