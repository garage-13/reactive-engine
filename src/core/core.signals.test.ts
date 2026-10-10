import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронные Сигналы и Эффекты`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = new ReactiveEngineCore()
    })
    it('должен сохранять начальное значение, обновлять его и запускать эффект', async () => {
      const engine = new Engine()
      const sig = engine.signal('initial')
      const spy = vi.fn()

      engine.effect(() => { spy(sig.value) })
      spy.mockClear()

      sig.value = 'updated'

      if (isAsync) {
        // Для автоматической версии даем микрозадаче провернуться в Event Loop!
        await Promise.resolve()
      }

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('updated')
    })

    it('должен сохранять начальное значение, обновлять его и синхронно запускать эффект при изменении', () => {
      const sig = engine.signal('initial')
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('initial')
      spy.mockClear()

      // Боевая мутация — эффект срабатывает мгновенно и синхронно без queueMicrotask!
      sig.value = 'updated'
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('updated')

      // Установка идентичного значения — игнорируется (Equality Cut)
      spy.mockClear()
      sig.value = 'updated'
      expect(spy).not.toHaveBeenCalled()
    })

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта и при отписке', () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()

      const unsubscribe = engine.effect(() => {
        const val = sig.value
        return () => { cleanupSpy(val) }
      })

      expect(cleanupSpy).not.toHaveBeenCalled()

      // Синхронный перезапуск эффекта вызывает старый деструктор
      sig.value = 2
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)

      // Ручная отписка (dispose) немедленно триггерит финальный деструктор
      unsubscribe()
      expect(cleanupSpy).toHaveBeenCalledTimes(2)
      expect(cleanupSpy).toHaveBeenCalledWith(2)
    })

    it('должен поддерживать декларативную валидацию значений сигнала', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const sig = engine.signal(10, {
        validate: (val) => val > 0 || 'Число должно быть больше 0',
      })

      sig.value = -5 // Запись невалидного значения блокируется
      expect(sig.value).toBe(10)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('должен мутировать массивы в Сигнале напрямую и запускать граф при пинке сеттера самому себе', () => {
      const tagsSignal = engine.signal(['js'])
      const spy = vi.fn()

      engine.effect(() => {
        spy(tagsSignal.value.join(', '))
      })
      spy.mockClear()

      // 1. Императивная мутация (больше никакого spread-оператора!)
      tagsSignal.value.push('ts')
      tagsSignal.value.push('vue')
      tagsSignal.value.splice(1, 1) // удалили 'ts'

      // 2. Пинаем сеттер сигнала самому себе.
      // Наш фикс ядра снимает ссылочный барьер для объектов, и граф просыпается синхронно!
      tagsSignal.value = tagsSignal.value

      expect(spy).toHaveBeenCalledWith('js, vue')
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('должен блокировать бесконечные циклы, если мутация происходит внутри этого же эффекта', () => {
      const sig = engine.signal(10)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)

        // Циклический вызов: пишем в этот же сигнал изнутри его же эффекта!
        // Благодаря нашему барьеру "if (consumer === engine.activeConsumer) return",
        // ядро блокирует синхронную рекурсию и не взрывает стек вызовов V8.
        sig.value = 20
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(sig.value).toBe(20)
    })
  })
})
