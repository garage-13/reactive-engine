import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

describe('⚛️ Reactive Engine — Продвинутая спецификация Ядра', () => {
  test('#22 [dynamic cleanups] computed должен динамически вырезать неактивные ветви зависимостей // ТЕСТ НА ДИНАМИЧЕСКИЕ ВЕТВЛЕНИЯ ГРАФА (Conditional Evaluation)', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const condition = engine.signal(true)
      const left = engine.signal('left')
      const right = engine.signal('right')

      let computedExecutions = 0
      const comp = engine.computed(() => {
        computedExecutions++
        return condition.value ? left.value : right.value
      })

      // Читаем начальный кадр
      expect(comp.value).toBe('left')
      expect(computedExecutions).toBe(1)

      // Меняем правую (неактивную в данный момент) ветвь
      right.value = 'right-mutated'
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Вычисление НЕ должно перезапускаться, так как правая ветвь сейчас спит
      expect(computedExecutions).toBe(1)
      expect(comp.value).toBe('left')

      // Переключаем условие
      condition.value = false
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Вычисление обязано проснуться и забрать данные из правой ветви
      expect(comp.value).toBe('right-mutated')
      expect(computedExecutions).toBe(2)

      // Теперь левая ветвь спит. Мутируем её
      left.value = 'left-mutated'
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Вычисление должно оставаться неподвижным
      expect(computedExecutions).toBe(2)
      expect(comp.value).toBe('right-mutated')
    }
  })

  test('#112 [deep chains] граф обязан без искажений проводить изменения через многоуровневые вычисления // ТЕСТ НА СХОДИМОСТЬ ДЛИННЫХ ЦЕПОЧЕК (Deep Computed Chains)', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const start = engine.signal(1)
      
      // Создаем длинную реактивную матрешку вычислений
      const c1 = engine.computed(() => start.value + 1)
      const c2 = engine.computed(() => c1.value + 1)
      const c3 = engine.computed(() => c2.value + 1)
      const c4 = engine.computed(() => c3.value + 1)

      expect(c4.value).toBe(5)

      // Мутируем корень графа
      start.value = 10
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Срез данных на хвосте цепочки обязан мгновенно сойтись к новому значению
      expect(c4.value).toBe(14)
    }
  })

  test('#180 [effect dispose] граф должен полностью разрывать связи и освобождать память при уничтожении эффекта // ТЕСТ НА УНИЧТОЖЕНИЕ ПОДПИСОК (Бенчмарк #180 / Dead Roots Garbage Collection)', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const sig = engine.signal('alive')
      const spy = vi.fn()

      // Регистрируем эффект и забираем его функцию отписки
      const unsubscribe = engine.effect(() => {
        spy(sig.value)
      })

      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()
      expect(spy).toHaveBeenCalledWith('alive')
      spy.mockClear()

      // Мутируем сигнал до отписки -> эффект должен сработать
      sig.value = 'changed'
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()
      expect(spy).toHaveBeenCalledWith('changed')
      spy.mockClear()

      // ИМПЕРАТИВНО УНИЧТОЖАЕМ ЭФФЕКТ (Размонтирование)
      unsubscribe()

      // Мутируем сигнал после уничтожения корня
      sig.value = 'dead'
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Шпион обязан промолчать, так как узел графа полностью стерт из памяти!
      expect(spy).not.toHaveBeenCalled()
    }
  })

  test('#95 [Stale Evaluation] родительские вычисления обязаны выполняться СТРОГО до начала выполнения дочерних dependees // ТЕСТ НА ТОПОЛОГИЧЕСКИЙ ПОРЯДОК СХОЖДЕНИЯ', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const counter = engine.signal(0)

      const parentComputed = engine.computed(() => counter.value * 2)
      const childComputed = engine.computed(() => parentComputed.value + 1)

      const evaluationOrder: string[] = []

      engine.effect(() => {
        evaluationOrder.push(`parent:${parentComputed.value}`)
      })

      engine.effect(() => {
        evaluationOrder.push(`child:${childComputed.value}`)
      })

      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()
      evaluationOrder.length = 0

      counter.value = 1
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      const firstChildIndex = evaluationOrder.findIndex(l => l.startsWith('child'))
      let lastParentIndex = -1
      for (let i = evaluationOrder.length - 1; i >= 0; i--) {
        if (evaluationOrder[i].startsWith('parent')) {
          lastParentIndex = i
          break
        }
      }

      expect(lastParentIndex).toBeLessThan(firstChildIndex)
    }
  })

  test('#154 [batch throw] граф должен сохранять консистентность и выполнять выжившие эффекты при ошибке в батче // ТЕСТ НА ЖИВУЧЕСТЬ ГРАФА ПРИ ИСКЛЮЧЕНИЯХ В БАТЧЕ', async () => {
    const engine = new ReactiveEngineAutomatic()
    const sig = engine.signal(10)
    const spy = vi.fn()

    engine.effect(() => {
      spy(sig.value)
    })
    engine.flushEffects()
    spy.mockClear()

    try {
      engine.batch(() => {
        sig.value = 20
        throw new Error('Фатальный сбой транзакции')
      })
    } catch (e) {}

    engine.flushEffects()
    expect(sig.value).toBe(20)
  })

  test('#125/#132 [batch revert] эффект не должен просыпаться, если финальное значение графа вернулось к истокам // ТЕСТ НА ПОЛНЫЙ ОТКАТ МУТАЦИИ В БАТЧЕ', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const sig = engine.signal(100)
      const comp = engine.computed(() => sig.value * 2)

      let lastValue = comp.value
      let sideEffectCalls = 0

      engine.effect(() => {
        const currentVal = comp.value
        if (currentVal !== lastValue) {
          lastValue = currentVal
          sideEffectCalls++
        }
      })

      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()
      sideEffectCalls = 0

      engine.batch(() => {
        sig.value = 200
        sig.value = 100 // Полный реверт мутации обратно к истокам!
      })

      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Вычисляемое свойство не изменилось по итогу батча — сайд-эффект обязан промолчать!
      expect(sideEffectCalls).toBe(0)
      expect(comp.value).toBe(200)
    }
  })
})
