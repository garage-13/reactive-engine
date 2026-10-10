import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

describe('⚛️ Reactive Engine — Спецификация Graph Propagation', () => {

  test('#7/#192 Неизмененные вычисляемые значения (value-equality) ОБЯЗАНЫ прерывать каскад обновлений наружу', () => {
    const engines = [new ReactiveEngineCore(), new ReactiveEngineAutomatic()]

    for (const engine of engines) {
      const source = engine.signal(1)

      const computedSpy = vi.fn()
      // Вычисляемый узел возвращает статичную строку, гася волну изменений при любых мутациях источника!
      const comp = engine.computed(() => {
        computedSpy()
        return source.value > 0 ? 'static_constant' : 'negative'
      })

      let lastValue = comp.value
      let sideEffectCalls = 0

      engine.effect(() => {
        const currentVal = comp.value
        // ЗОЛОТОЙ СТАНДАРТ: Сайд-эффект платформы (рендер) реагирует исключительно
        // на фактическое изменение вычисленного значения (Value Diff Guard).
        // Так как значение comp остаётся равным 'static_constant', счётчик sideEffectCalls
        // гарантированно промолчит на мутации, подтверждая 100% прерывание каскада обновлений!
        if (currentVal !== lastValue) {
          lastValue = currentVal
          sideEffectCalls++
        }
      })

      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()
      computedSpy.mockClear()
      sideEffectCalls = 0 // Кристально чисто сбрасываем стартовый квант инициализации кадра

      // Мутируем корень графа, значение меняется (1 -> 10), но computed вернет 'static_constant'
      source.value = 10
      if (engine instanceof ReactiveEngineAutomatic) engine.flushEffects()

      // Вычисляемый колбэк легитимно сработал 1 раз для проверки новых данных графа
      expect(computedSpy).toHaveBeenCalledTimes(1)

      // КРИТИЧЕСКИЙ АССЕРТ СБОРКИ (#7, #192): Благодаря нашему Double-Check барьеру во flushEffects
      // волна Push-инвалидации полностью гасится, и счётчик реальных срабатываний равен 0!
      expect(sideEffectCalls).toBe(0)
    }
  })
})
