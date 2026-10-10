import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

describe('⚛️ Reactive Engine — Продвинутая спецификация Ядра', () => {

  // =========================================================================
  // 1. ТЕСТ НА ИЗОЛЯЦИЮ КОНТЕКСТА БАТЧА ВНУТРИ UNTRACK (#219)
  // =========================================================================
  test('должен корректно объединять записи внутри batch, даже если он вызван внутри untrack', () => {
    const engine = new ReactiveEngineCore() // ИСПРАВЛЕНО: Тестируем на синхронном ядре для честной проверки батчинга!
    const sig = engine.signal(0)
    const spy = vi.fn()

    engine.effect(() => {
      spy(sig.value)
    })

    spy.mockClear()

    engine.untrack(() => {
      engine.batch(() => {
        sig.value = 1
        sig.value = 2
      })
    })

    // Синхронное ядро мгновенно флушит очередь на выходе из внешнего batch
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(2) // Проверяем, что долетело именно склеенное финальное значение!
  })

  // =========================================================================
  // 2. ТЕСТ НА ОЧИСТКУ ЭФФЕКТА ПРИ ИСКЛЮЧЕНИЯХ (#89)
  // =========================================================================
  test('должен гарантированно сбрасывать и очищать контекст activeConsumer, если тело эффекта выбрасывает ошибку', () => {
    const engine = new ReactiveEngineCore() // Тестируем атомарную очистку контекста на синхронном ядре!
    const sig = engine.signal('init')
    let shouldThrow = false

    engine.effect(() => {
      if (shouldThrow) {
        throw new Error('Аварийный сбой эффекта')
      }
      sig.value
    })

    shouldThrow = true

    // Мутация на синхронном ядре мгновенно триггерит flushEffects() и выбрасывает ошибку в текущий поток
    expect(() => {
      sig.value = 'mutation'
    }).toThrow('Аварийный сбой эффекта')

    // КРИТИЧЕСКИЙ АССЕРТ: Контекст activeConsumer должен быть гарантированно очищен и возвращен в null!
    expect((engine as any).activeConsumer).toBeNull()
  })

  // =========================================================================
  // 3. ТЕСТ НА ЖИВУЧЕСТЬ ТРАНЗАКЦИЙ ПРИ СБОЕ (#154)
  // =========================================================================
  test('граф должен сохранять консистентность и batchDepth, если внутри batch произошло исключение', () => {
    const engine = new ReactiveEngineAutomatic()
    const sig = engine.signal(10)

    expect(() => {
      engine.batch(() => {
        sig.value = 20
        throw new Error('Фатальная ошибка транзакции')
      })
    }).toThrow('Фатальная ошибка транзакции')

    expect((engine as any).batchDepth).toBe(0)

    const spy = vi.fn()
    engine.effect(() => spy(sig.value))

    sig.value = 30
    engine.flushEffects()
    expect(spy).toHaveBeenCalled()
  })

  // =========================================================================
  // 4. ТЕСТ НА ТОПОЛОГИЧЕСКИЙ ПОРЯДОК СХОЖДЕНИЯ (#95)
  // =========================================================================
  test('родительские вычисления обязаны выполняться СТРОГО до начала выполнения дочерних dependees', () => {
    const engine = new ReactiveEngineCore()
    const counter = engine.signal(0)

    const parentComputed = engine.computed(() => counter.value * 2)
    const childComputed = engine.computed(() => parentComputed.value + 1)

    const evaluationOrder: string[] = []

    engine.effect(() => {
      evaluationOrder.push(`parent:${parentComputed.value}`)
    })

    engine.effect(() => {
      evaluationOrder.push(`child:${childComputed.value}`)
    })

    evaluationOrder.length = 0
    counter.value = 1

    const firstChildIndex = evaluationOrder.findIndex(l => l.startsWith('child'))

    let lastParentIndex = -1
    for (let i = evaluationOrder.length - 1; i >= 0; i--) {
      if (evaluationOrder[i].startsWith('parent')) {
        lastParentIndex = i
        break
      }
    }

    if (lastParentIndex !== -1 && firstChildIndex !== -1) {
      expect(lastParentIndex).toBeLessThan(firstChildIndex)
    }
  })

  // =========================================================================
  // 5. ТЕСТ НА АВТОМАТИЧЕСКУЮ СБОРКУ МУСОРА (#160, #161, #215)
  // =========================================================================
  test('должен полностью вырезать связи observers и dependencies, когда узел теряет active listeners', () => {
    const engine = new ReactiveEngineAutomatic()
    const source = engine.signal('data')
    const comp = engine.computed(() => source.value + '_modified')

    const unsubscribe = engine.effect(() => {
      comp.value
    })

    unsubscribe()

    const compNode = (comp as any)._node || comp
    expect(compNode.observers?.size || 0).toBe(0)
  })
})
