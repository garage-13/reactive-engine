/**
 * Изолированный менеджер атомарных транзакций (batch) реактивного графа.
 * Гарантирует объединение множественных мутаций и выполнение эффектов строго один раз на выходе.
 */
export function executeBatch<T>(engine: any, fn: () => T): T {
  engine.batchDepth++
  try {
    return fn()
  } finally {
    engine.batchDepth--
    if (engine.batchDepth === 0) {
      engine.flushEffects()
    }
  }
}
