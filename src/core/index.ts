// 1. Дефолтный экспорт: автоматическое ядро на микрозадачах
export { ReactiveEngineAutomatic as ReactiveEngine } from './core.automatic'
export * from './core.automatic'

// 2. Экспорт всей цепочки специализированных ядер
export { ReactiveEngineCore } from './core'
export { ReactiveEngineAutolog } from './core.autolog'

export * from './core'
export * from './core.autolog'
export * from './types'
export * from './AbstractService'
export * from './BaseREServiceEnhanced'
