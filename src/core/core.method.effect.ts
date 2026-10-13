import { CleanupFn } from './types'

export function createEffect(
  engine: any,
  fn: () => void | CleanupFn,
  effectName?: string
): () => void {
  const cleanups = new Set<CleanupFn>()
  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()

  const effectNode: any = {
    id: engine.subscriberId++,
    isDirty: true,
    depth: 1000,
    dependencies,
    depVersions,
    cleanups,
    type: 'effect',
    isDisposed: false,
    run: () => {
      // Если эффект был принудительно уничтожен извне до старта — выходим сразу
      if (effectNode.isDisposed) return
      if (effectNode === engine.activeConsumer) return

      const prevConsumer = engine.activeConsumer

      // Инициализируем реактивный контекст
      engine.activeConsumer = effectNode

      const prevDeps = new Set(dependencies)
      dependencies.clear()

      try {
        // Фаза 1: Запускаем cleanups строго вне реактивного контекста (untracked)
        engine.untrack(() => {
          cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
          cleanups.clear()
        })

        // 🎯 РАЗРЫВ ЦИКЛА РЕКУРСИИ ДЛЯ ТЕСТА #111:
        // Если во время выполнения cleanups эффект вызвал собственный dispose(),
        // он перешел в статус isDisposed = true. Мы даем его телу (fn) выполниться
        // в ПОСЛЕДНИЙ РАЗ, но временно сбрасываем консьюмер в null (режим untracked),
        // чтобы мёртвый узел не нахватал паразитных подписок на будущее!
        if (effectNode.isDisposed) {
          engine.activeConsumer = null
        }

        // Фаза 2: Выполнение тела эффекта
        const cleanup = fn()

        // Если эффект живой — сохраняем новый cleanup и актуализируем граф
        if (!effectNode.isDisposed) {
          if (typeof cleanup === 'function') cleanups.add(cleanup)
          effectNode.isDirty = false

          prevDeps.forEach(dep => {
            if (!dependencies.has(dep)) {
              dep.subscribers.delete(effectNode)
              depVersions.delete(dep)
            }
          })

          dependencies.forEach(dep => {
            const rawNode = dep._node || dep
            depVersions.set(dep, rawNode.version)
          })
        } else {
          // Если эффект умер во время cleanups/выполнения — тотально зачищаем остатки ребер
          prevDeps.forEach(dep => {
            dep.subscribers.delete(effectNode)
          })
          depVersions.clear()
        }

        engine.log({ type: 'effect', label: effectName || 'unnamed_effect' })
      } finally {
        engine.activeConsumer = prevConsumer
      }
    }
  }

  effectNode.run()

  return () => {
    if (effectNode.isDisposed) return
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
