// Экспортируем всю цепочку специализированных ядер
export { ReactiveEngineCore } from './core/core'
export { ReactiveEngineAutomatic as ReactiveEngine } from './core/core.automatic'
export { ReactiveEngineAutomatic } from './core/core.automatic'
export { ReactiveEngineAutolog } from './core/core.autolog'

// Контракты типов и DI-сервисы
export * from './core/types'
export * from './core/AbstractService'
export * from './core/BaseREServiceEnhanced'
