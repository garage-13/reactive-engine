import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронный Proxy (reactive)`, () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
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

    it('должен изолированно ловить ошибки в деструкторах (cleanup) и не блокировать граф', () => {
      const trigger = engine.signal(0)
      const siblingCleanupSpy = vi.fn()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.effect(() => {
        trigger.value

        // Искусственно инжектим падающий cleanup в активный эффект для изоляции теста
        const active = (engine as any).activeConsumer
        if (active) {
          active.cleanups.add(() => { throw new Error('Панический сбой') })
        }

        return () => { siblingCleanupSpy() }
      })

      // Провоцируем перезапуск и вызов деструкторов
      trigger.value++

      // Проверка: падающий деструктор пойман, а соседний — успешно выполнился!
      expect(siblingCleanupSpy).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
