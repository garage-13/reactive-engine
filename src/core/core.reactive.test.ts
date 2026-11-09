import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore, isAsync: false },
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронный Proxy (reactive)`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = new ReactiveEngineCore()
    })

    it('должен синхронно трекать глубокие свойства и кэшировать инстансы Proxy', () => {
      const state = engine.reactive({ user: { age: 25 } })
      const spy = vi.fn()

      engine.effect(() => { spy(state.user.age) })
      spy.mockClear()

      // Синхронная мутация — эффект срабатывает мгновенно без queueMicrotask!
      state.user.age = 26
      expect(spy).toHaveBeenCalledWith(26)
      expect(spy).toHaveBeenCalledTimes(1)

      // Проверка кэширования прокси-зеркал
      const sameObj = { x: 1 }
      expect(engine.reactive(sameObj)).toBe(engine.reactive(sameObj))
    })

    it('должен динамически перестраивать ветки зависимостей и отписываться от мертвых веток', () => {
      const store = engine.reactive({ branch: 'a', a: 10, b: 20 })

      // ИСПРАВЛЕНО: Завернули в фигурные скобки, чтобы функция возвращала void вместо number
      const spy = vi.fn(() => {
        const _ = store.branch === 'a' ? store.a : store.b
      })

      engine.effect(spy)
      spy.mockClear()

      // Изменение неактивной ветки (b) — тишина
      store.b = 99
      expect(spy).not.toHaveBeenCalled()

      // Переключаем ветку на 'b' — эффект синхронно пересчитался
      store.branch = 'b'
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()

      // Теперь ветка 'a' мертва. Ее мутация не должна вызывать триггер
      store.a = 999
      expect(spy).not.toHaveBeenCalled()
    })

    it('должен нативно, синхронно и атомарно батчить мутации массивов (.push, .splice, .reverse, индексы)', () => {
      const state = engine.reactive({ tags: ['js', 'ts'], numbers: [1, 2, 3] })

      // ИСПРАВЛЕНО: Добавлены фигурные скобки, чтобы функции возвращали void вместо number
      const spyLength = vi.fn(() => { state.tags.length })
      const spyIndex = vi.fn(() => { state.numbers[0] })

      engine.effect(spyLength)
      engine.effect(spyIndex)
      spyLength.mockClear()
      spyIndex.mockClear()

      // 1. Нативный .push() — склеивается и срабатывает строго 1 раз
      state.tags.push('vue')
      expect(spyLength).toHaveBeenCalledTimes(1)

      // 2. Нативный .splice()
      state.tags.splice(1, 1)
      expect(state.tags).toEqual(['js', 'vue'])

      // 3. Прямая мутация по индексу
      state.numbers[0] = 99
      expect(spyIndex).toHaveBeenCalledTimes(1)

      // 4. Нативный .reverse()
      state.numbers.reverse()
      expect(spyIndex).toHaveBeenCalledTimes(2)
    })

    it('должен корректно вызывать функцию очистки (cleanup) перед следующим запуском', () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()
      const effectSpy = vi.fn()

      engine.effect(() => {
        // ⚡ ФИКС: Фиксируем значение в локальной переменной scope
        const currentValue = sig.value

        effectSpy(currentValue)
        return () => {
          cleanupSpy(currentValue) // Теперь замыкание помнит старый snapshot!
        }
      })

      expect(effectSpy).toHaveBeenCalledWith(1)
      expect(cleanupSpy).not.toHaveBeenCalled()

      // Изменяем корень графа
      sig.value = 2

      // Очистка вызывается со старым сохраненным значением 1
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)
      expect(effectSpy).toHaveBeenCalledWith(2)
    })

    it('(See also: #renderHook) должен нативно трекать глубокие мутации Proxy-объектов и массивов внутри batch ровно в 1 вызов эффекта', () => {
      const state = engine.reactive({
        user: {
          name: 'Иван',
          todos: ['Купить молоко']
        }
      })

      const spy = vi.fn()

      // Регистрируем канонический эффект ядра для глубокого Proxy-объекта
      engine.effect(() => {
        // Явно считываем глубокие свойства, чтобы граф зафиксировал зависимости
        spy(state.user.name, [...state.user.todos])
      })

      // Сбрасываем стартовый вызов эффекта при инициализации
      spy.mockClear()

      // Выполняем точечную мутацию свойства и деструктивный push массива внутри batch
      engine.batch(() => {
        state.user.name = 'Алексей'
        state.user.todos.push('Написать тесты подписки')

        // Внутри батча эффект еще заблокирован планировщиком
        expect(spy).not.toHaveBeenCalled()
      })

      // На выходе из батча эффект обязан выполниться СИНХРОННО и РОВНО 1 раз с финальным стейтом!
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('Алексей', ['Купить молоко', 'Написать тесты подписки'])
    })
  })
})
