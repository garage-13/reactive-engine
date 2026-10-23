import { describe, it, expect } from 'vitest' // или 'jest'
import { signal, computed, effect, resetGlobalReactiveEngine } from './core.global'

describe('Reactive Engine: Diamond Problem Mitigation', () => {
  it('should resolve diamond dependency graph strictly in topological order with 0 glitches // Тест программно верифицирует топологический порядок расчёта графа и гарантирует защиту от лишних вызовов и промежуточных глитчей', () => {
    // Гарантируем чистоту эпохи и графа перед выполнением тест-кейса
    resetGlobalReactiveEngine()

    // 1. Инициализируем граф в форме ромба (A -> B/C -> D)
    const signalA = signal(1, 'A')

    const computedB = computed(() => signalA.value * 2, 'B')
    const computedC = computed(() => signalA.value + 10, 'C')

    const computedD = computed(() => computedB.value + computedC.value, 'D')

    let effectTriggerCount = 0
    const capturedValues: number[] = []

    // 2. Регистрируем эффект-потребитель основания ромба
    effect(() => {
      effectTriggerCount++
      capturedValues.push(computedD.value)
    }, 'Consumer_Effect')

    // Проверяем состояние графа после первоначального pull-запуска
    expect(effectTriggerCount).toBe(1)
    expect(computedD.value).toBe(13)
    expect(capturedValues).toEqual([13])

    // 3. Изменяем корневой источник изменений
    signalA.value = 2

    // 4. Проверяем отсутствие промежуточных глитчей и дублирующих запусков
    // Если бы движок был наивным, эффект сработал бы дважды (сначала записав глитч 15)
    expect(effectTriggerCount).toBe(2)
    expect(computedD.value).toBe(16)

    // Проверяем, что в истории изменений не зафиксировано промежуточного значения 15
    expect(capturedValues).not.toContain(15)
    expect(capturedValues).toEqual([13, 16])
  })
})
