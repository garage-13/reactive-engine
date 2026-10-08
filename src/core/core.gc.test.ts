import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

interface EngineWithPrivate {
  allEffects: Set<unknown>;
  computedCache: Map<unknown, unknown>;
}

// Выносим изолированную функцию наверх
// Это гарантирует, что при выходе из этой функции стек Node.js полностью очистится
function createTemporaryComputed(engine: ReactiveEngine, countSignal: any) {
  // Просто создаем computed и считываем значение, чтобы активировать эффект
  const isEven = engine.computed(() => countSignal.value % 2 === 0)
  return isEven.value
}

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  // ==========================================
  // ТЕСТЫ с Garbage Collector
  // Чтобы принудительно разорвать контекст выполнения и гарантировать,
  // что V8 полностью сотрет локальные ссылки из стека,
  // мы должны вынести создание computed в отдельную изолированную функцию верхнего уровня,
  // а вызов сборщика мусора сделать многократным с микро-паузами (setTimeout / setImmediate).
  // ==========================================
  describe('Автоочистка памяти через FinalizationRegistry', () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен автоматически стирать эффект из ядра, когда GC удаляет computed из памяти', async () => {
      if (typeof global.gc !== 'function') {
        console.warn('⚠️ Тест пропущен: Запустите vitest с флагом --expose-gc')
        return
      }

      const count = engine.signal(10)
      const getAllEffectsSize = () => (engine as unknown as EngineWithPrivate).allEffects.size
      const getCacheSize = () => (engine as unknown as EngineWithPrivate).computedCache.size

      const initialEffects = getAllEffectsSize()

      // 2. Вызываем изолированную функцию. Ссылка внутри нее умирает сразу после выполнения
      createTemporaryComputed(engine, count)

      // В ядре сейчас зафиксирован 1 эффект
      expect(getAllEffectsSize()).toBe(initialEffects + 1)
      expect(getCacheSize()).toBe(1)

      // 3. Запускаем агрессивный цикл сборки мусора (Full GC)
      // Иногда V8 требуется 2-3 прохода, чтобы переместить объект в старое поколение и полностью удалить
      for (let i = 0; i < 3; i++) {
        global.gc()
        // Делаем микропаузу, позволяя Event Loop переключить контексты задач
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // 4. Ожидаем, пока FinalizationRegistry асинхронно выполнит коллбек очистки ядра
      await vi.waitFor(() => {
        expect(getAllEffectsSize()).toBe(initialEffects)
        expect(getCacheSize()).toBe(0)
      })
    })
  })
})
