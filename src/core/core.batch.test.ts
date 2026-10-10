import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронный Batching`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = new ReactiveEngineCore()
    })

    it('должен склеивать обновления и выполнять эффект строго 1 раз на выходе из батча', () => {
      const sig1 = engine.signal(1)
      const sig2 = engine.signal(10)
      const spy = vi.fn()

      // Подписываемся на сигналы
      engine.effect(() => {
        spy(sig1.value, sig2.value)
      })
      spy.mockClear() // Сбрасываем стартовый вызов

      // Запускаем транзакцию
      engine.batch(() => {
        sig1.value = 2
        sig2.value = 20

        // Внутри батча эффект еще заблокирован и не сработал промежуточно
        expect(spy).not.toHaveBeenCalled()
      })

      // На выходе из батча эффект сработал синхронно РОВНО 1 раз для финальных значений!
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(2, 20)
    })

    it('должен поддерживать вложенные батчи и флушить эффекты только на выходе из самого внешнего', () => {
      const sig = engine.signal(0)
      const spy = vi.fn()

      engine.effect(() => { spy(sig.value) })
      spy.mockClear()

      engine.batch(() => {
        sig.value = 1

        // Вложенный батч
        engine.batch(() => {
          sig.value = 2
          expect(spy).not.toHaveBeenCalled()
        })

        // Вышли из внутреннего, но внешний еще открыт — эффект все еще ждет
        expect(spy).not.toHaveBeenCalled()
      })

      // Вышли из внешнего — эффект синхронно выполнился 1 раз с финальным значением
      expect(spy).toHaveBeenCalledTimes(1)
      expect(sig.value).toBe(2)
    })
  })
})
