import {
  // ReactiveEngineCore,
  currentEngineInstance,
  resetGlobalReactiveEngine as resetEngineInstance,
} from './core'
import { Computed, EffectFn, Signal, Token, Factory } from './types'

/**
 * Создает новый реактивный сигнал в рамках текущей глобальной эпохи.
 *
 * @template T Тип значения, хранящегося внутри сигнала.
 * @param initialValue Начальное состояние сигнала.
 * @param optionsOrName Строковое имя или конфигурационный объект для отладки.
 */
export function signal<T>(
  initialValue: T,
  optionsOrName?: string | { name?: string }
): Signal<T> {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.signal<T>(initialValue, optionsOrName)
}

/**
 * Создает декларативное вычисляемое свойство (Computed) в рамках текущей глобальной эпохи.
 * Полностью мемоизирует результат вычисления и использует ленивую pull-модель на NodeLink-связях.
 *
 * @template T Тип возвращаемого функцией значения.
 * @param fn Чистая функция-вычислитель.
 * @param signalName Опциональное имя для логирования и отладки графа.
 */
export function computed<T>(fn: () => T, signalName?: string): Computed<T> {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.computed<T>(fn, signalName)
}

/**
 * Регистрирует сайд-эффект в планировщике текущей глобальной эпохи.
 * Синхронно запускает первый проход вычисления для сбора реактивных зависимостей.
 *
 * @param fn Функция эффекта, которая может возвращать деструктор (колбэк очистки).
 * @param effectName Опциональное имя эффекта для трассировки и изоляции.
 * @returns Функция полного императивного разрыва связей и уничтожения (unsub/dispose).
 */
export function effect(fn: EffectFn, effectName?: string): () => void {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.effect(fn, effectName)
}

/**
 * Группирует последовательные мутации сигналов в единую атомарную транзакцию.
 * Откладывает флуш и выполнение эффектов до выхода из самого внешнего макро-батча.
 *
 * @template T Тип возвращаемого транзакционной функцией значения.
 * @param fn Функция, выполняющая пакетное обновление стейта.
 */
export function batch<T>(fn: () => T): T {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.batch<T>(fn)
}

/**
 * Временно замораживает автоматический трекинг зависимостей текущего потребителя.
 * Позволяет безопасно читать реактивные узлы внутри эффектов без создания циклов и лишних ребер.
 *
 * @template T Тип возвращаемого значения.
 * @param fn Контекстная функция чтения.
 */
export function untrack<T>(fn: () => T): T {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.untrack<T>(fn)
}

/**
 * Бескомпромиссно сжигает текущую глобальную реактивную эпоху.
 * Инициализирует новое изолированное ядро графа, гарантируя, что старые компоненты
 * и кэши вычислений не протекут в новые тестовые раны или жизненные циклы приложения.
 */
export function resetGlobalReactiveEngine(): void {
  resetEngineInstance()
}

/**
 * Регистрирует зависимость или фабрику в DI-контейнере текущей глобальной эпохи.
 *
 * @template T Тип регистрируемого значения.
 * @param token Уникальный ключ токена (строка, символ или класс).
 * @param valueOrFactory Значение или ленивая фабричная функция.
 */
export function provide<T>(token: Token<T>, valueOrFactory: T | Factory<T>): void {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  currentEngineInstance.provide<T>(token, valueOrFactory)
}

/**
 * Извлекает или лениво инициализирует зависимость из DI-контейнера текущей глобальной эпохи.
 * Гарантирует защиту от циклических ссылок в графе сервисов.
 *
 * @template T Тип извлекаемой зависимости.
 * @param token Уникальный ключ токена.
 */
export function inject<T>(token: Token<T>): T {
  if (!currentEngineInstance) {
    throw new Error('[Reactive Engine v3] Global engine instance is not initialized.')
  }
  return currentEngineInstance.inject<T>(token)
}
