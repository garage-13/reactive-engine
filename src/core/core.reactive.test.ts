import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Reactive Proxy', () => {
    it('должен отслеживать изменения глубоких свойств объекта', async () => { // <-- 1. Добавили async
      const state = engine.reactive({ user: { age: 25 }, tags: ['js'] })
      const spy = vi.fn()

      const userState = state.user

      engine.effect(() => {
        spy(userState.age)
      })

      spy.mockClear()
      userState.age = 26

      // 2. Ждем, пока асинхронный автобатчинг ядра прогонит очередь микрозадач
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

      // 3. Теперь проверка честно сойдется!
      expect(spy).toHaveBeenCalledWith(26)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('должен кешировать Proxy для одного и того же объекта', () => {
      const obj = { x: 1 }
      const proxy1 = engine.reactive(obj)
      const proxy2 = engine.reactive(obj)

      expect(proxy1).toBe(proxy2)
    })

    describe('Динамический трекинг зависимостей (Dynamic Dependency Tracking)', () => {
      it('должен гарантированно очищать неактивные ветки зависимостей при динамическом переключении условий', async () => { // <-- Добавили async
        const engine = new ReactiveEngine()

        // Заворачиваем флаг условия внутрь реактивного объекта вместе с данными
        const store = engine.reactive({
          activeBranch: 'a', // Может быть 'a' или 'b'
          a: 0,
          b: 0
        })

        const effectSpy = vi.fn(() => {
          const value = store.activeBranch === 'a' ? store.a : store.b
        })

        // Инициализация эффекта (Запуск #1)
        engine.effect(effectSpy, 'dynamic-dependency-test')
        expect(effectSpy).toHaveBeenCalledTimes(1)

        // === ШАГ 1: Изменение активной ветки (store.a) ===
        store.a = 10
        // Проталкиваем микрозадачу автобатчинга Proxy
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        expect(effectSpy).toHaveBeenCalledTimes(2) // Запуск #2 (сработал на 'a')

        // === ШАГ 2: Изменение неактивной ветки (store.b) ===
        store.b = 99
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        expect(effectSpy).toHaveBeenCalledTimes(2) // Тишина, на 'b' подписки нет

        // === ШАГ 3: Переключаем ветку через реактивное свойство ===
        store.activeBranch = 'b'
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        expect(effectSpy).toHaveBeenCalledTimes(3) // Запуск #3 (переключился на 'b')

        // === ШАГ 4: Проверяем очистку старой ветки ===
        // Изменяем store.a. Так как activeBranch теперь 'b', подписка на 'a' должна быть аннулирована.
        store.a = 30
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        expect(effectSpy).toHaveBeenCalledTimes(3) // УСПЕХ! Больше НЕ вызывается.

        // === ШАГ 5: Проверяем работу новой активной ветки ===
        store.b = 100
        await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
        expect(effectSpy).toHaveBeenCalledTimes(4) // Запуск #4 (сработал на 'b')
      })
    })

    it('должен корректно очищать неактивные ветки при хаотичном случайном ветвлении (дословный кейс с Math.random)', async () => {
      const engine = new ReactiveEngine()
      const store = engine.reactive({ a: 0, b: 0 })

      // Перехватываем Math.random, чтобы сделать тест детерминированным в рантайме,
      // но имитирующим хаотичные прыжки условия туда-сюда
      let mockRandomValue = 0.9 // > 0.5 (ветка A)
      vi.spyOn(Math, 'random').mockImplementation(() => mockRandomValue)

      const effectSpy = vi.fn(() => {
      // Дословный кейс коллеги
        const value = Math.random() > 0.5 ? store.a : store.b
      })

      engine.effect(effectSpy, 'math-random-dependency-test')
      expect(effectSpy).toHaveBeenCalledTimes(1)

      // --- ТАКТ 1: Активна ветка A ---
      store.a = 10
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(2)

      store.b = 99 // Неактивна. Тишина.
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(2)

      // --- ТАКТ 2: Хаос! Переключаем на ветку B ---
      mockRandomValue = 0.1 // < 0.5 (ветка B)
      store.a = 20 // Триггерим перезапуск через А, чтобы эффект зашел в ветку B
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(3)

      // Теперь ветка А должна быть мертва. Проверяем:
      store.a = 30
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(3) // УСПЕХ! Ветка А очистилась.

      // Ветка B активна:
      store.b = 100
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(4)

      // --- ТАКТ 3: Хаос возвращается! Прыгаем обратно на ветку A ---
      mockRandomValue = 0.8 // > 0.5 (ветка A)
      store.b = 200 // Триггерим перезапуск через B, чтобы эффект вернулся на А
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(5)

      // Теперь ветка B должна умереть. Проверяем:
      store.b = 300
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(5) // УСПЕХ! Ветка B очистилась.

      // Ветка А снова активна:
      store.a = 400
      await new Promise<void>((r) => queueMicrotask(r))
      expect(effectSpy).toHaveBeenCalledTimes(6)

      // Восстанавливаем оригинальный Math.random
      vi.spyOn(Math, 'random').mockRestore()
    })

    it('должен гарантированно аннулировать подписку на reactive объект после остановки эффекта и не воскресать при мутациях', async () => {
      const engine = new ReactiveEngine()
      const state = engine.reactive({ count: 0 })
      const spy = vi.fn()

      const stop = engine.effect(() => {
        spy(state.count)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()

      // Останавливаем эффект
      stop()

      // Мутируем свойство Proxy
      state.count = 1
      await new Promise<void>((r) => queueMicrotask(r))

      // ТЕСТ ДОЛЖЕН ПОКАЗАТЬ, ЧТО ЭФФЕКТ БОЛЬШЕ НЕ ВЫЗЫВАЕТСЯ
      expect(spy).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledTimes(0)
    })
  })

  describe('Глубокая Proxy-реактивность: Массивы и Вложенные структуры', () => {

    it('должен корректно отслеживать обновление массивов через spread-оператор (иммутабельный паттерн)', async () => {
      const engine = new ReactiveEngine()
      const state = engine.reactive({ tags: ['js'] })
      const spy = vi.fn()

      engine.effect(() => {
        spy(state.tags.length)
      })

      expect(spy).toHaveBeenCalledWith(1)
      spy.mockClear()

      // Рекомендованный паттерн для массивов в reactive-engine:
      // Переприсваивание через spread-оператор идеально перехватывается сеттером Proxy
      state.tags = [...state.tags, 'ts']

      // Дожидаемся окончания очереди микрозадач нашего нового автобатчинга Proxy
      await new Promise<void>((r) => queueMicrotask(r))

      expect(spy).toHaveBeenCalledWith(2)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('должен гарантированно очищать подписки на вложенные подобъекты при остановке эффекта', async () => {
      const engine = new ReactiveEngine()
      // Глубокая структура (матрешка) объекта
      const state = engine.reactive({
        user: {
          profile: {
            name: 'Иван'
          }
        }
      })
      const spy = vi.fn()

      const stop = engine.effect(() => {
        spy(state.user.profile.name)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()

      // Останавливаем эффект — все cleanups глубоких Proxy-путей должны сработать
      stop()

      // Мутируем самое глубокое свойство
      state.user.profile.name = 'Алексей'
      await new Promise<void>((r) => queueMicrotask(r))

      // Проверяем, что глубокий путь полностью отписался и эффект не воскрес
      expect(spy).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledTimes(0)
    })

  })
})
