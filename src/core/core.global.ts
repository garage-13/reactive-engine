import { ReactiveEngineCore } from './core'

// Единый глобальный инстанс по умолчанию
let globalEngine = new ReactiveEngineCore({ logger: { isEnabled: false } })

export const signal = <T>(initialValue: T, options?: any) => globalEngine.signal(initialValue, options)
export const computed = <T>(fn: () => T, name?: string) => globalEngine.computed(fn, name)
export const effect = (fn: () => any, name?: string) => globalEngine.effect(fn, name)
export const batch = <T>(fn: () => T): T => globalEngine.batch(fn)
export const untrack = <T>(fn: () => T): T => globalEngine.untrack(fn)

/**
 * ⚡ ХУК ДЛЯ БЕНЧМАРКОВ И ТЕСТОВЫХ СРЕД:
 * Позволяет атомарно уничтожить старый граф реактивности и начать с чистого листа,
 * полностью исключая утечки памяти и пересечение эпох между тест-кейсами.
 */
export function resetGlobalReactiveEngine(): void {
  // Старый инстанс со всеми WeakMap и StringCache уходит в Garbage Collector
  globalEngine = new ReactiveEngineCore({ logger: { isEnabled: false } })
}
