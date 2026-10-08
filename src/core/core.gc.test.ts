import { describe, it, expect, beforeEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Сборка мусора (GC)`, () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен автоматически очищать кэш при уничтожении computed через destroy', () => {
      const count = engine.signal(10)

      const computeFn = () => count.value % 2 === 0
      const comp = engine.computed(computeFn)

      // В кэше должен быть ровно один элемент
      expect(engine.computedCache.size).toBe(1)

      // Вызываем деструктор
      comp.destroy()

      // Кэш обязан стать пустым
      expect(engine.computedCache.size).toBe(0)
    })
  })
})
