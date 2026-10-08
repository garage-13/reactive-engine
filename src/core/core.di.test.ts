import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Dependency Injection`, () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен регистрировать, лениво кешировать фабрики и автоматически инжектить классы-конструкторы', () => {
    // 1. Простая регистрация значения
      engine.provide('CONFIG', { host: 'localhost' })
      expect(engine.inject<any>('CONFIG').host).toBe('localhost')

      // 2. Ленивая фабрика
      const factorySpy = vi.fn(() => ({ data: 'ok' }))
      engine.provide('API', factorySpy)

      expect(factorySpy).not.toHaveBeenCalled() // Ленивость
      const inst1 = engine.inject<any>('API')
      const inst2 = engine.inject<any>('API')
      expect(factorySpy).toHaveBeenCalledTimes(1) // Кэширование
      expect(inst1).toBe(inst2)

      // 3. Автоматическое создание класса по конструктору
      class TestService {
        constructor(public eng: ReactiveEngine) {}
      }
      const serviceInstance = engine.inject(TestService)
      expect(serviceInstance).toBeInstanceOf(TestService)
      expect(serviceInstance.eng).toBe(engine)
    })

    it('должен корректно разрешать многоуровневые иерархические цепочки и поддерживать переопределение', () => {
      class ServiceA {}
      class ServiceB {
        public a = engine.inject(ServiceA) // Зависимость от А
      }

      // Проверяем авто-раскрутку графа
      const instanceB = engine.inject(ServiceB)
      expect(instanceB.a).toBeInstanceOf(ServiceA)

      // Проверяем переопределение токена (override)
      engine.provide('ENDPOINT', 'prod')
      engine.provide('ENDPOINT', 'dev')
      expect(engine.inject('ENDPOINT')).toBe('dev')
    })

    it('должен выбрасывать понятные ошибки при пустых или циклических зависимостях', () => {
    // Пустой токен
      expect(() => engine.inject(undefined as any)).toThrow('[DI Error]')

      engine.provide('A', (eng: ReactiveEngine) => eng.inject('B'))
      engine.provide('B', (eng: ReactiveEngine) => eng.inject('A'))
      expect(() => engine.inject('A')).toThrow()
    })

  })
})
