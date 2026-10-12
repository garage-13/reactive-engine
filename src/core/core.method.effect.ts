import { CleanupFn } from './types'

/**
 * Изолированная фабрика сайд-эффектов реактивного графа.
 * Полностью отвязана от лексического контекста класса для абсолютной чистоты V8.
 */
export function createEffect(
  engine: any,
  fn: () => void | CleanupFn,
  effectName?: string
): () => void {
  const cleanups = new Set<CleanupFn>()
  const dependencies = new Set<any>()
  
  const effectNode: any = {
    id: engine.subscriberId++,
    isDirty: true,
    depth: 1000,
    dependencies,
    cleanups,
    type: 'effect',
    run: () => {
      if (effectNode.isDisposed) return
      if (effectNode === engine.activeConsumer) return
      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = effectNode
      const prevDeps = new Set(dependencies)
      dependencies.clear()
      try {
        cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
        cleanups.clear()
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.add(cleanup)
        effectNode.isDirty = false
        prevDeps.forEach(dep => {
          if (!dependencies.has(dep)) dep.subscribers.delete(effectNode)
        })
        engine.log({ type: 'effect', label: effectName || 'unnamed_effect' })
      } finally {
        engine.activeConsumer = prevConsumer
      }
    }
  }
  
  effectNode.run()
  
  return () => {
    effectNode.isDisposed = true
    cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
    cleanups.clear()
    dependencies.forEach(dep => dep.subscribers.delete(effectNode))
    dependencies.clear()
    engine.pendingEffects.delete(effectNode)
  }
}
