import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineAutomatic } from './core.automatic'
import { ReactiveEngineCore } from './core'

describe('🧠 Reactive Engine — Спецификация Memory & GC', () => {

  // =========================================================================
  // 1. ПОВЕДЕНЧЕСКИЙ ТЕСТ НА ОЧИСТКУ СВЯЗЕЙ (Бенчмарк #160)
  // =========================================================================
  test('#160 ссылки консьюмера должны полностью вырезаться из памяти после потери всех слушателей', async () => {
    const engine = new ReactiveEngineAutomatic()
    const source = engine.signal('init')

    const computedSpy = vi.fn()
    const comp = engine.computed(() => {
      computedSpy(source.value)
      return source.value + '_computed'
    })

    // Создаем активного слушателя
    const unsubscribe = engine.effect(() => {
      comp.value
    })

    // Принудительно флушим очередь, чтобы зафиксировать первый кадр графа
    engine.flushEffects()
    expect(computedSpy).toHaveBeenCalledTimes(1)
    computedSpy.mockClear()

    // УНИЧТОЖАЕМ СЛУШАТЕЛЯ (Всплывает волна dispose)
    unsubscribe()
    engine.flushEffects()

    // МУТИРУЕМ СИГНАЛ-ИСТОЧНИК
    source.value = 'mutation'
    engine.flushEffects()

    // КРИТИЧЕСКИЙ АССЕРТ СБОРКИ МУСОРА БЕНЧМАРКА: Так как эффект уничтожен,
    // узел computed потерял всех слушателей и обязан был полностью отписаться от сигнала!
    // Если каскадная очистка сработала верно — вычисляемый узел останется холодным,
    // а шпион внутри computed ни разу не проснется! Это доказывает 0 утечек в памяти.
    expect(computedSpy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 2. ПОВЕДЕНЧЕСКИЙ ТЕСТ НА КАСКАДНУЮ ОЧИСТКУ ЦЕПОЧЕК (Бенчмарк #161)
  // =========================================================================
  test('#161 каскадная очистка many-level computed-цепочек после удаления слушателей', () => {
    const engine = new ReactiveEngineCore()
    const start = engine.signal(1)

    const fn1 = () => start.value + 1
    const fn2 = () => c1.value + 1
    const fn3 = () => c2.value + 1

    const c1 = engine.computed(fn1)
    const c2 = engine.computed(fn2)
    const c3 = engine.computed(fn3)

    const unsubscribe = engine.effect(() => {
      c3.value
    })

    expect(engine.computedCache.has(fn1)).toBe(true)
    expect(engine.computedCache.has(fn2)).toBe(true)
    expect(engine.computedCache.has(fn3)).toBe(true)

    unsubscribe()

    // Канонически освобождаем цепочку через деструктор
    c3.destroy()

    // Проверяем, что мертвые ребра графа каскадно выжглись до самого корня!
    expect((start as any)._node.subscribers.size).toBe(0)
    expect((c1 as any)._node.subscribers.size).toBe(0)
    expect((c2 as any)._node.subscribers.size).toBe(0)
  })

  // =========================================================================
  // 3. ТЕСТ НА ЧАСТИЧНЫЙ DISPOSE СОСЕДНИХ ЭФФЕКТОВ (Бенчмарк #215)
  // =========================================================================
  test('#215 partial dispose: sibling effect still notified', async () => {
    const engine = new ReactiveEngineAutomatic()
    const source = engine.signal('core_data')

    const spy1 = vi.fn()
    const spy2 = vi.fn()

    const unsubscribe1 = engine.effect(() => { spy1(source.value) })
    const unsubscribe2 = engine.effect(() => { spy2(source.value) })

    engine.flushEffects()
    spy1.mockClear()
    spy2.mockClear()

    unsubscribe1()
    engine.flushEffects()

    source.value = 'mutation_data'
    engine.flushEffects()

    expect(spy1).not.toHaveBeenCalled()
    expect(spy2).toHaveBeenCalledTimes(1)
  })
})
