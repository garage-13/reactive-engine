import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore, isAsync: false },
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Синхронный Batching`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = new ReactiveEngineCore()
    })

    it('должен склеивать обновления и выполнять эффект строго 1 раз на выходе из батча', () => {
      const sig1 = engine.signal(1)
      const sig2 = engine.signal(10)
      const spy = vi.fn()

      // Подписываемся на сигналы
      engine.effect(() => {
        spy(sig1.value, sig2.value)
      })
      spy.mockClear() // Сбрасываем стартовый вызов

      // Запускаем транзакцию
      engine.batch(() => {
        sig1.value = 2
        sig2.value = 20

        // Внутри батча эффект еще заблокирован и не сработал промежуточно
        expect(spy).not.toHaveBeenCalled()
      })

      // На выходе из батча эффект сработал синхронно РОВНО 1 раз для финальных значений!
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(2, 20)
    })

    it('должен поддерживать вложенные батчи и флушить эффекты только на выходе из самого внешнего', () => {
      const sig = engine.signal(0)
      const spy = vi.fn()

      engine.effect(() => { spy(sig.value) })
      spy.mockClear()

      engine.batch(() => {
        sig.value = 1

        // Вложенный батч
        engine.batch(() => {
          sig.value = 2
          expect(spy).not.toHaveBeenCalled()
        })

        // Вышли из внутреннего, но внешний еще открыт — эффект все еще ждет
        expect(spy).not.toHaveBeenCalled()
      })

      // Вышли из внешнего — эффект синхронно выполнился 1 раз с финальным значением
      expect(spy).toHaveBeenCalledTimes(1)
      expect(sig.value).toBe(2)
    })
  })

  describe(`B: ${name} — Batching`, () => {

    // =========================================================================
    // 📦 ГРУППА: АВТOБАТЧИНГ И НЕЯВНЫЕ МАКРO-ТРАНЗАКЦИИ (Implicit Coalescing)
    // =========================================================================

    it('#B-1: implicit batching — multiple signal writes coalesce into single update', () => {
      const engine = new ReactiveEngineCore()
      const a = engine.signal(0)
      const b = engine.signal(0)

      let effectRuns = 0
      const spy = vi.fn()

      engine.effect(() => {
        effectRuns++
        spy(a.value, b.value)
      })

      expect(effectRuns).toBe(1)
      spy.mockClear()

      // В синхронных архитектурах атомарное группирование проверяется внутри транзакции
      engine.batch(() => {
        a.value = 10
        b.value = 20
      })

      expect(effectRuns).toBe(2) // 1 (старт) + 1 (транзакция)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenLastCalledWith(10, 20)
    })


    it('#B-2: computed coalescing — chained lazy computeds do not fire early during multi-source updates', () => {
      const engine = new ReactiveEngineCore()
      const source = engine.signal(1)

      let c1Runs = 0
      const c1 = engine.computed(() => {
        c1Runs++
        return source.value + 10
      })

      let c2Runs = 0
      const c2 = engine.computed(() => {
        c2Runs++
        return c1.value * 2
      })

      // Прогреваем цепочку вычислений
      expect(c2.value).toBe(22) // (1 + 10) * 2
      expect(c1Runs).toBe(1)
      expect(c2Runs).toBe(1)

      // Пинаем корень
      source.value = 2

      // Считываем хвост цепочки c2.value.
      // Движок обязан выполнить топологический проход: c1 должен обновиться строго перед c2,
      // и каждый узел в рамках этого изменения должен перезапуститься ровно по ОДНOМУ разу!
      expect(c2.value).toBe(24) // (2 + 10) * 2
      expect(c1Runs).toBe(2)
      expect(c2Runs).toBe(2) // Фантомные или промежуточные пересчеты исключены
    })

    it('#B-3: re-entry write batching — inner signal write inside effect queued correctly', () => {
      const engine = new ReactiveEngineCore()
      const trigger = engine.signal(0)
      const data = engine.signal('init')

      let receiverRuns = 0
      const spyReceiver = vi.fn()

      // Эффект-слушатель изменений данных
      engine.effect(() => {
        receiverRuns++
        spyReceiver(data.value)
      })

      // Эффект-передатчик (Re-entry Writer): при изменении trigger записывает данные в data
      engine.effect(() => {
        if (trigger.value > 0) {
          data.value = `changed_to_${trigger.value}` // Побочная запись во время флуша эффектов!
        }
      })

      expect(receiverRuns).toBe(1)
      spyReceiver.mockClear()

      // Запускаем триггер
      trigger.value = 1

      // КРИТИЧЕСКИЙ ИНВАРИАНТ RE-ENTRY:
      // Побочная запись 'data.value = ...' произошла во время фазы выполнения эффектов.
      // Планировщик Ядра обязан не потерять это уведомление, поставить его в очередь,
      // и атомарно обновить зависимый эффект spyReceiver.
      expect(receiverRuns).toBe(2)
      expect(spyReceiver).toHaveBeenLastCalledWith('changed_to_1')
    })
  })

})
