import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Computed Properties', () => {
    it('должен вычислять значение на основе зависимых сигналов', async () => {
      const firstName = engine.signal('John')
      const lastName = engine.signal('Doe')
      const fullName = engine.computed(() => `${firstName.value} ${lastName.value}`)

      expect(fullName.value).toBe('John Doe')

      firstName.value = 'Jane'

      // Вычисление computed завязано на эффект, который теперь асинхронный
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(fullName.value).toBe('Jane Doe')
    })

    it('должен позволять подписываться на изменение вычисляемого значения', async () => {
      const count = engine.signal(1)
      const isEven = engine.computed(() => count.value % 2 === 0)
      const spy = vi.fn()

      isEven.subscribe(spy)

      count.value = 2

      // Ждем цепочку микрозадач сигналов и computed
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith(true)
      })
    })

    it('должен удалять внутренний эффект из памяти ядра при вызове метода destroy', async () => {
      const count = engine.signal(1)
      const getAllEffectsSize = () => (engine as any).allEffects.size
      const initialSize = getAllEffectsSize()

      const isEven = engine.computed(() => count.value % 2 === 0)
      expect(getAllEffectsSize()).toBe(initialSize + 1)

      count.value = 2

      // Даем отработать обновлению до того, как уничтожим
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      expect(isEven.value).toBe(true)

      isEven.destroy()
      expect(getAllEffectsSize()).toBe(initialSize)
    })
  })
})
