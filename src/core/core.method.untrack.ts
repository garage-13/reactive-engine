/**
 * Изолированный менеджер контекста untrack реактивного графа.
 * Временно замораживает автоматический сбор зависимостей, подменяя activeConsumer на null.
 */
export function executeUntrack<T>(engine: any, fn: () => T): T {
  const prevConsumer = engine.activeConsumer
  engine.activeConsumer = null
  try {
    return fn()
  } finally {
    engine.activeConsumer = prevConsumer
  }
}
