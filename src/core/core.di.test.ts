import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Dependency Injection (provide / inject)', () => {
    it('должен корректно регистрировать и возвращать простые значения/сервисы', () => {
      const token = 'CONFIG_TOKEN'
      engine.provide(token, { apiUrl: 'localhost' })

      const config = engine.inject<{ apiUrl: string }>(token)
      expect(config.apiUrl).toBe('localhost')
    })

    it('должен лениво создавать инстанс через фабрику при первом вызове inject', () => {
      const token = 'FACTORY_TOKEN'
      const factorySpy = vi.fn(() => ({ foo: 'bar' }))

      // Создаем чистую функцию-фабрику
      const myFactory = (eng: ReactiveEngine) => factorySpy()

      // Принудительно удаляем у нее свойство prototype, чтобы обойти жесткую проверку в ядре
      Object.defineProperty(myFactory, 'prototype', { value: undefined })

      // Регистрируем фабрику в DI-контейнере
      engine.provide(token, myFactory)

      // Проверяем, что до вызова inject фабрика не вызывалась
      expect(factorySpy).not.toHaveBeenCalled()

      // Первый вызов — должен запустить фабрику и вернуть инстанс
      const instance1 = engine.inject(token)
      expect(factorySpy).toHaveBeenCalledTimes(1)
      expect(instance1).toEqual({ foo: 'bar' })

      // Повторный вызов — должен вернуть закешированный инстанс без повторного вызова фабрики
      const instance2 = engine.inject(token)
      expect(factorySpy).toHaveBeenCalledTimes(1)
      expect(instance1).toBe(instance2)
    })

    it('должен автоматически создавать класс-сервис, если токен является конструктором', () => {
      class TestService {
        constructor(public eng: ReactiveEngine) { }
      }

      const instance = engine.inject(TestService)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.eng).toBe(engine)
    })

    it('должен выбрасывать ошибку, если токен не найден или пустой', () => {
      // Проверяем ошибку для пустого токена
      expect(() => engine.inject(undefined as any)).toThrow(
        '[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.'
      )
      // Проверяем ошибку для неизвестного токена
      expect(() => engine.inject('UNKNOWN_TOKEN')).toThrow(
        '[DI Error]: Не удалось создать сервис UNKNOWN_TOKEN. Ошибка: Service not found: UNKNOWN_TOKEN'
      )
    })
  })
})
