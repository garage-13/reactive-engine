import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Signals & Effects', () => {
    it('должен сохранять начальное значение и обновлять его при записи', () => {
      const sig = engine.signal(10)
      expect(sig.value).toBe(10)

      sig.value = 20
      expect(sig.value).toBe(20)
    })

    it('должен автоматически запускать эффект при изменении сигнала', async () => {
      const sig = engine.signal('initial')
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('initial')

      sig.value = 'updated'

      // Ждем выполнения отложенного микрозадачей эффекта
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy).toHaveBeenCalledWith('updated')
    })

    it('не должен триггерить эффект, если устанавливается идентичное значение', () => {
      const sig = engine.signal(42)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      spy.mockClear()
      sig.value = 42 // Значение не изменилось
      expect(spy).not.toHaveBeenCalled()
    })

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта', async () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()

      const unsubscribe = engine.effect(() => {
        const val = sig.value
        return () => cleanupSpy(val)
      })

      expect(cleanupSpy).not.toHaveBeenCalled()

      sig.value = 2 // Перезапуск эффекта отложен

      // Ждем выполнения микрозадачи
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)

      unsubscribe() // Ручная отписка происходит синхронно
      expect(cleanupSpy).toHaveBeenCalledTimes(2)
      expect(cleanupSpy).toHaveBeenCalledWith(2)
    })


    it('должен поддерживать валидацию значений сигнала', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const sig = engine.signal(10, {
        validate: (val) => val > 0 || 'Число должно быть больше 0',
      })

      sig.value = -5 // Невалидное значение
      expect(sig.value).toBe(10) // Значение не изменилось
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
