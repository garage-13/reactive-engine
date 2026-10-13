import { CleanupFn } from './types'

export function createEffect(
  engine: any,
  fn: () => void | CleanupFn,
  effectName?: string
): () => void {
  const cleanups = new Set<CleanupFn>()
  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>() // Слепки версий родителей для этого эффекта

  const effectNode: any = {
    id: engine.subscriberId++,
    isDirty: true,
    depth: 1000,
    dependencies,
    depVersions,
    cleanups,
    type: 'effect',
    run: () => {
      if (effectNode.isDisposed) return
      if (effectNode === engine.activeConsumer) return

      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = effectNode

      const prevDeps = new Set(dependencies)
      dependencies.clear()
      // Не очищаем depVersions полностью, чтобы сохранить старые версии для сверки

      try {
        engine.untrack(() => {
          cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
          cleanups.clear()
        })

        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.add(cleanup)
        effectNode.isDirty = false

        // Убираем подписку у ушедших зависимостей
        prevDeps.forEach(dep => {
          if (!dependencies.has(dep)) {
            dep.subscribers.delete(effectNode)
            depVersions.delete(dep)
          }
        })

        // Синхронизируем актуальные версии зафиксированных зависимостей
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
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
    engine.untrack(() => {
      cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
      cleanups.clear()
    })
    dependencies.forEach(dep => dep.subscribers.delete(effectNode))
    dependencies.clear()
    depVersions.clear()
    engine.pendingEffects.delete(effectNode)
  }
}
