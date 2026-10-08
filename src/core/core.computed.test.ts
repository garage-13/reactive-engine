import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронный Computed (Push/Pull)`, () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен лениво вычислять значение и кэшировать его (O(1) доступ)', () => {
      const rawSignal = engine.signal(10)
      const spy = vi.fn(() => rawSignal.value * 2)

      const double = engine.computed(spy)

      // До первого чтения функция вычисления не вызывается (Lazy Pull)
      expect(spy).not.toHaveBeenCalled()

      // Первый расчет — греет кэш
      expect(double.value).toBe(20)
      expect(spy).toHaveBeenCalledTimes(1)

      // Повторные чтения берут значение из кэша за O(1)
      expect(double.value).toBe(20)
      expect(double.value).toBe(20)
      expect(spy).toHaveBeenCalledTimes(1) // Функция по-прежнему вызвалась ровно 1 раз
    })

    it('должен синхронно сбрасывать кэш при мутации сигнала и обновлять зависимый эффект', () => {
      const rawSignal = engine.signal(0)
      const double = engine.computed(() => rawSignal.value * 2)
      const spy = vi.fn()

      // Подписываем эффект на компьютед
      engine.effect(() => {
        spy(double.value)
      })
      expect(spy).toHaveBeenCalledWith(0)
      spy.mockClear()

      // Боевая мутация сигнала
      rawSignal.value = 5

      // Больше никаких асинхронных ожиданий! Кэш сброшен, а эффект сработал синхронно и мгновенно!
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(10)
      expect(double.value).toBe(10)
    })

    it('должен корректно обновлять многоуровневые цепочки вычислений (Эффект домино)', () => {
      const rawSignal = engine.signal('a')

      // Цепочка: Signal -> Computed A -> Computed B
      const upper = engine.computed(() => rawSignal.value.toUpperCase())
      const repeat = engine.computed(() => `${upper.value}${upper.value}`)

      expect(repeat.value).toBe('AA')

      // Мутируем корень графа
      rawSignal.value = 'b'

      // Волна инвалидации синхронно прошла по всей цепочке
      expect(repeat.value).toBe('BB')
    })

    it('должен автоматически поддерживать трекинг динамических зависимостей (Dynamic Deps)', () => {
      const condSignal = engine.signal(true)
      const sigA = engine.signal('A')
      const sigB = engine.signal('B')

      const spy = vi.fn(() => condSignal.value ? sigA.value : sigB.value)
      const dynamicComp = engine.computed(spy)

      expect(dynamicComp.value).toBe('A')
      spy.mockClear()

      // Переключаем ветку условия if/else в компьютеде
      condSignal.value = false

      expect(dynamicComp.value).toBe('B')

      // Проверяем, что старая зависимость (sigA) успешно деактивирована:
      // Мутация неактивного sigA не должна приводить к пересчету кэша!
      sigA.value = 'NEW_A'
      expect(dynamicComp.value).toBe('B')
      expect(spy).toHaveBeenCalledTimes(1) // Вызов произошел только при переключении condSignal
    })
  })
})
