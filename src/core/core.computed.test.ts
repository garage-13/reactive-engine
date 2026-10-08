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

    it('должен корректно обновлять многоуровневые цепочки computed (эффект домино) при мутации массива в Сигнале', async () => {
      const engine = new ReactiveEngine()
      const tagsSignal = engine.signal(['js', 'ts'])

      // Computed A: Переводит теги в верхний регистр
      const upperTags = engine.computed(() => {
        return tagsSignal.value.map(t => t.toUpperCase())
      })

      // Computed B: Зависит от Computed A и склеивает их в строку
      const tagsString = engine.computed(() => {
        return upperTags.value.join(' | ')
      })

      expect(tagsString.value).toBe('JS | TS')

      const spy = vi.fn()
      engine.effect(() => {
        spy(tagsString.value)
      })
      spy.mockClear()

      // Мутируем исходный массив
      tagsSignal.value.push('rs')
      tagsSignal.value = tagsSignal.value // Пинаем сеттер

      await new Promise<void>((r) => queueMicrotask(r))

      // Вся цепочка должна синхронно сбросить кэш и лениво пересчитаться
      expect(spy).toHaveBeenCalledWith('JS | TS | RS')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(tagsString.value).toBe('JS | TS | RS')
    })

    it('должен синхронно сбрасывать кэш computed при изменении порядка элементов массива через .reverse() в Сигнале', async () => {
      const engine = new ReactiveEngine()
      const numbersSignal = engine.signal([1, 2, 3])

      // Вычисляемое свойство возвращает первый элемент массива
      const firstElement = engine.computed(() => {
        return numbersSignal.value[0]
      })

      expect(firstElement.value).toBe(1)

      const spy = vi.fn()
      engine.effect(() => {
        spy(firstElement.value)
      })
      spy.mockClear()

      // Разворачиваем массив нативно внутри сигнала
      numbersSignal.value.reverse()
      numbersSignal.value = numbersSignal.value // Пинаем сеттер

      await new Promise<void>((r) => queueMicrotask(r))

      // Кэш должен инвалидироваться, выдав новое значение первого индекса
      expect(spy).toHaveBeenCalledWith(3)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(firstElement.value).toBe(3)
    })

    it('должен сохранять O(1) кэш и предотвращать лишние UI-ререндеры, если результат вычисления не изменился', async () => {
      const engine = new ReactiveEngine()
      const listSignal = engine.signal(['item1', 'item2'])

      // Вычисляемое свойство считает सिर्फ длину массива
      const listLength = engine.computed(() => {
        return listSignal.value.length
      })

      const spy = vi.fn()
      engine.effect(() => {
        spy(listLength.value)
      })
      expect(spy).toHaveBeenCalledWith(2)
      spy.mockClear()

      // Мутируем данные внутри массива, меняя состав, но НЕ меняя его длину!
      listSignal.value[0] = 'updated_item1'
      listSignal.value = listSignal.value // Пинаем сеттер

      await new Promise<void>((r) => queueMicrotask(r))

      // Так как длина массива осталась равной 2, зависимый эффект компонента
      // НЕ должен триггериться вхолостую! Доступ к кэшу занял O(1).
      expect(spy).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledTimes(0)
      expect(listLength.value).toBe(2)
    })

  })
})
