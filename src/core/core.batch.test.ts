import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Batching', () => {
    it('должен откладывать запуск эффектов до завершения батча (микрозадачи)', async () => {
      const sig1 = engine.signal(1)
      const sig2 = engine.signal(10)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig1.value, sig2.value)
      })

      spy.mockClear()

      engine.batch(() => {
        sig1.value = 2
        sig2.value = 20
        // Внутри батча эффект не должен сработать немедленно
        expect(spy).not.toHaveBeenCalled()
      })

      // Ждем выполнения очереди микрозадач (queueMicrotask)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

      // Эффект сработал ровно 1 раз для финальных значений вместо 2 раз
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(2, 20)
    })

    it('должен объединять несколько синхронных обновлений в один ререндер (Автобатчинг)', async () => {
      const sig1 = engine.signal(0)
      const sig2 = engine.signal(0)
      const effectSpy = vi.fn()

      // Создаем эффект, зависящий от обоих сигналов
      engine.effect(() => {
        effectSpy(sig1.value, sig2.value)
      })

      // Очищаем первоначальный вызов при монтировании эффекта
      effectSpy.mockClear()

      // Имитируем два синхронных изменения подряд БЕЗ использования метода engine.batch
      sig1.value = 10
      sig2.value = 20

      // Ждем окончания текущего цикла микрозадач (Event Loop)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

      // ПРОВЕРКА:
      // Если в вашей текущей версии ядра тест ПАДАЕТ (вызовов будет 2) — автобатчинга нет.
      // Иначе тест станет ЗЕЛЕНЫМ (вызов будет ровно 1)!
      expect(effectSpy).toHaveBeenCalledTimes(1)
      expect(effectSpy).toHaveBeenCalledWith(10, 20)
    })
  })
})
