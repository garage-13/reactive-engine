import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../../core/core'
import { withThrottleComputed } from './withThrottleComputed'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — withThrottleComputed Decorator`, () => {

    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('должен синхронно возвращать стартовое значение при инициализации', () => {
      const rawSignal = engine.signal<number>(10, 'raw')

      const throttled = withThrottleComputed(
        engine,
        () => rawSignal.value,
        { limit: 1000 },
        'test:throttled'
      )

      expect(throttled.value).toBe(10)
    })

    it('должен мгновенно пропустить первое изменение и задроттлить последующий спам (Лимит времени)', async () => {
      const rawSignal = engine.signal<number>(0, 'raw')

      const throttled = withThrottleComputed(
        engine,
        () => rawSignal.value,
        { limit: 1000 }
      )

      expect(throttled.value).toBe(0)

      // Первое боевое изменение — пробивается сразу благодаря синхронному графу
      rawSignal.value = 1
      await vi.advanceTimersByTimeAsync(0)
      expect(throttled.value).toBe(1)

      // Спамим изменения внутри виртуального окна 1000 мс
      rawSignal.value = 2
      rawSignal.value = 3
      rawSignal.value = 4
      await vi.advanceTimersByTimeAsync(0)

      // Спам гарантированно заблокирован троттлингом!
      expect(throttled.value).toBe(1)
    })

    it('должен гарантированно выполнить хвостовой вызов (Trailing Edge) последнего значения после лимита', async () => {
      const rawSignal = engine.signal<number>(0, 'raw')

      const throttled = withThrottleComputed(
        engine,
        () => rawSignal.value,
        { limit: 1000 }
      )

      rawSignal.value = 1
      await vi.advanceTimersByTimeAsync(0)
      expect(throttled.value).toBe(1)

      // Накапливаем "хвостовой" спам
      rawSignal.value = 2
      rawSignal.value = 42
      await vi.advanceTimersByTimeAsync(0)

      // Лимит времени еще не вышел
      expect(throttled.value).toBe(1)

      // Виртуально крутим время на 1000 мс вперед
      await vi.advanceTimersByTimeAsync(1000)

      // Хвостовое значение долетело безупречно
      expect(throttled.value).toBe(42)
    })

    it('должен корректно вызывать подписки фреймворков при обновлении затроттленного значения', async () => {
      const rawSignal = engine.signal<number>(0, 'raw')
      const spyCallback = vi.fn()

      const throttled = withThrottleComputed(
        engine,
        () => rawSignal.value,
        { limit: 1000 }
      )

      throttled.subscribe(spyCallback)
      spyCallback.mockClear() // Изолируем стартовый синхронный вызов подписки

      rawSignal.value = 10
      await vi.advanceTimersByTimeAsync(0)
      expect(spyCallback).toHaveBeenCalledTimes(1)

      // Спам блокируется
      rawSignal.value = 20
      rawSignal.value = 30
      await vi.advanceTimersByTimeAsync(0)
      expect(spyCallback).toHaveBeenCalledTimes(1)

      // Прокручиваем виртуальное время на секунду вперед
      await vi.advanceTimersByTimeAsync(1000)

      // Подписка сработала на хвостовое значение
      expect(spyCallback).toHaveBeenCalledTimes(2)
    })

    it('должен очищать внутренние таймеры setTimeout при вызове метода destroy', async () => {
      const rawSignal = engine.signal<number>(0, 'raw')

      const throttled = withThrottleComputed(
        engine,
        () => rawSignal.value,
        { limit: 1000 }
      )

      rawSignal.value = 1
      await vi.advanceTimersByTimeAsync(0)
      expect(throttled.value).toBe(1)

      rawSignal.value = 99
      await vi.advanceTimersByTimeAsync(0)

      // Уничтожаем до истечения лимита времени
      throttled.destroy()

      await vi.advanceTimersByTimeAsync(1000)

      // Очередь аннулирована методом destroy
      expect(throttled.value).toBe(1)
    })

    // ====================================================
    //  withThrottleComputed — Работа с массивами и коллекциями
    // ====================================================
    describe('withThrottleComputed — Работа с массивами и коллекциями', () => {

      it('должен отслеживать изменения массивов в Сигналах и прогонять их через Trailing edge при пинке сеттера самому себе', async () => {
        const tagsSignal = engine.signal(['js'])

        const throttled = withThrottleComputed(
          engine,
          () => [...tagsSignal.value],
          { limit: 1000 }
        )

        expect(throttled.value).toEqual(['js'])

        // 1. Первая мутация — Leading edge пробивается сразу
        tagsSignal.value.push('ts')
        tagsSignal.value = tagsSignal.value
        await vi.advanceTimersByTimeAsync(0)
        expect(throttled.value).toEqual(['js', 'ts'])

        // 2. Спамим мутации внутрь окна блокировки (пинаем сеттер самому себе)
        tagsSignal.value.push('vue')
        tagsSignal.value = tagsSignal.value
        tagsSignal.value.push('angular')
        tagsSignal.value = tagsSignal.value
        await vi.advanceTimersByTimeAsync(0)

        expect(throttled.value).toEqual(['js', 'ts'])

        // 3. Перематываем время лимита вперед на 1000мс
        await vi.advanceTimersByTimeAsync(1000)

        // Хвостовое состояние массива долетело в полном составе
        expect(throttled.value).toEqual(['js', 'ts', 'vue', 'angular'])
      })

      it('должен нативно трекать деструктивные мутации Proxy-массивов (.push) и отдавать актуальный срез данных на хвосте таймера', async () => {
        const state = engine.reactive({
          todos: ['Task 1']
        })

        const throttled = withThrottleComputed(
          engine,
          () => [...state.todos],
          { limit: 1000 }
        )

        expect(throttled.value).toEqual(['Task 1'])

        // 1. Первая мутация (Leading) — Proxy-ловушка срабатывает синхронно
        state.todos.push('Task 2')
        await vi.advanceTimersByTimeAsync(0)
        expect(throttled.value).toEqual(['Task 1', 'Task 2'])

        // 2. Накапливаем нативные мутации без асингулярного налета микрозадач!
        state.todos.push('Task 3')
        state.todos.push('Task 4')
        await vi.advanceTimersByTimeAsync(0)

        expect(throttled.value).toEqual(['Task 1', 'Task 2'])

        // 3. Крутим виртуальное время на 1000мс вперед, провоцируя Trailing edge
        await vi.advanceTimersByTimeAsync(1000)

        // Декоратор нативно прочитал изменившийся прокси-массив по истечении таймаута
        expect(throttled.value).toEqual(['Task 1', 'Task 2', 'Task 3', 'Task 4'])
      })

      it('должен корректно обновлять затроттленный computed, если он зависит от обычного computed, фильтрующего массив', async () => {
        const listSignal = engine.signal(['apple', 'banana', 'orange'])

        const longWords = engine.computed(() => {
          return listSignal.value.filter(word => word.length > 5)
        })

        const throttled = withThrottleComputed(
          engine,
          () => longWords.value.join('-'),
          { limit: 1000 }
        )

        expect(throttled.value).toBe('banana-orange')

        listSignal.value.push('pineapple')
        listSignal.value = listSignal.value
        await vi.advanceTimersByTimeAsync(0)

        // Волна инвалидации прошла мгновенно через всю цепочку вычислений (Leading edge)
        expect(throttled.value).toBe('banana-orange-pineapple')

        listSignal.value.push('watermelon')
        listSignal.value = listSignal.value
        await vi.advanceTimersByTimeAsync(0)

        // Заблокировано троттлингом
        expect(throttled.value).toBe('banana-orange-pineapple')

        await vi.advanceTimersByTimeAsync(1000)

        // Хвост успешно долетел через граф зависимостей
        expect(throttled.value).toBe('banana-orange-pineapple-watermelon')
      })

    })
  })
})
