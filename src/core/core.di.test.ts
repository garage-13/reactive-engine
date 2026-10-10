import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic }
]

engines.forEach(({ name, Engine }) => {
  describe(`${name} — Dependency Injection`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      // ИСПРАВЛЕНО: Инстанцируем именно тот класс ядра, который тестируется в данной секции!
      engine = new Engine()
    })

    it('должен регистрировать, лениво кешировать фабрики и автоматически инжектить классы-конструкторы', () => {
      // 1. Простая регистрация значения
      engine.provide('CONFIG', { host: 'localhost' })
      expect(engine.inject<any>('CONFIG').host).toBe('localhost')

      // 2. Ленивая фабрика
      const factorySpy = vi.fn(() => ({ data: 'ok' }))
      // Помечаем мок-функцию витеста специальным флагом, чтобы DI-контейнер отличил её от класса
      ;(factorySpy as any)._isMockFunction = true
      engine.provide('API', factorySpy)

      expect(factorySpy).not.toHaveBeenCalled() // Ленивость
      const inst1 = engine.inject<any>('API')
      const inst2 = engine.inject<any>('API')
      expect(factorySpy).toHaveBeenCalledTimes(1) // Кэширование
      expect(inst1).toBe(inst2)

      // 3. Автоматическое создание класса по конструктору
      class TestService {
        constructor(public eng: any) {}
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

      engine.provide('A', (eng: any) => eng.inject('B'))
      engine.provide('B', (eng: any) => eng.inject('A'))
      expect(() => engine.inject('A')).toThrow('[DI Error]')
    })

  })
})
