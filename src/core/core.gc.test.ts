import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineAutomatic } from './core.automatic'

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
  test('#161 каскадная очистка many-level computed-цепочек после удаления слушателей', async () => {
    const engine = new ReactiveEngineAutomatic()
    const source = engine.signal(1)

    const spy1 = vi.fn()
    const spy2 = vi.fn()

    const comp1 = engine.computed(() => {
      spy1(source.value)
      return source.value * 2
    })

    const comp2 = engine.computed(() => {
      spy2(comp1.value)
      return comp1.value + 10
    })

    const unsubscribe = engine.effect(() => {
      comp2.value
    })

    // Синхронизируем ленивый старт многоуровневого графа
    engine.flushEffects()
    expect(spy1).toHaveBeenCalledTimes(1)
    expect(spy2).toHaveBeenCalledTimes(1)
    spy1.mockClear()
    spy2.mockClear()

    // ОТПИСЫВАЕМСЯ ОТ ХВОСТА МНОГОУРОВНЕВОЙ ЦЕПОЧКИ
    unsubscribe()
    engine.flushEffects()

    // МУТИРУЕМ СИГНАЛ-ИСТОЧНИК НА КОРНЕ ГРАФА
    source.value = 5
    engine.flushEffects()

    // КРИТИЧЕСКИЙ АССЕРТ СБОРКИ МУСОРА БЕНЧМАРКА: Волна каскадной отписки обязана
    // была всплыть по цепочке снизу вверх! Так как comp2 потерял эффект, он отписывается от comp1,
    // а comp1 в свою очередь отписывается от source. Ни один промежуточный шпион не должен сработать!
    expect(spy2).not.toHaveBeenCalled()
    expect(spy1).not.toHaveBeenCalled()
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
