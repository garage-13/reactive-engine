import { CleanupFn } from './types'

export function createEffect(
  engine: any,
  fn: () => void | CleanupFn,
  effectName?: string
): () => void {
  const cleanups = new Set<CleanupFn>()
  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()

  // Список дочерних вложенных эффектов, созданных этим эффектом
  const ownedEffects = new Set<any>()

  const effectNode: any = {
    id: engine.subscriberId++,
    isDirty: true,
    depth: 1000,
    dependencies,
    depVersions,
    cleanups,
    ownedEffects,
    type: 'effect',
    isDisposed: false,
    run: () => {
      // Если эффект был принудительно уничтожен ДО старта фазы — выходим сразу
      if (effectNode.isDisposed) return
      if (effectNode === engine.activeConsumer) return

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      // Переключаем глобальные контексты ядра на текущий эффект
      engine.activeConsumer = effectNode
      engine.activeOwner = effectNode

      const prevDeps = new Set(dependencies)
      dependencies.clear()

      try {
        // 🌳 Каскадно уничтожаем старых детей перед новым запуском
        ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
        ownedEffects.clear()

        // Выполняем функции очистки (cleanups)
        engine.untrack(() => {
          cleanups.forEach(cb => { try { cb() } catch (err) { console.error(err) } })
          cleanups.clear()
        })

        // 🎯 ФИКС КЕЙСА #111 С УЧЕТОМ КОНТЕКСТА ВЛАДЕНИЯ:
        // Если во время вызова cleanups эффект уничтожил сам себя —
        // мы ОБЯЗАНЫ дать его телу выполниться в последний раз (чтобы инкрементировать счетчик),
        // но переводим сбор зависимостей в режим untracked, обнуляя активного консьюмера.
        if (effectNode.isDisposed) {
          engine.activeConsumer = null
        }

        // Выполнение тела эффекта
        const cleanup = fn()

        // Если эффект остался живым — сохраняем новые рёбра графа
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
          // Если эффект умер на лету — тотально зачищаем все входящие связи
          prevDeps.forEach(dep => { dep.subscribers.delete(effectNode) })
          depVersions.clear()
        }

        engine.log({ type: 'effect', label: effectName || 'unnamed_effect' })
      } finally {
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
      }
    }
  }

  // Автоматическая регистрация в родительском контексте владения (Effect или Computed)
  if (engine.activeOwner && engine.activeOwner.ownedEffects) {
    engine.activeOwner.ownedEffects.add(effectNode)
  }


  effectNode.run()

  const disposeFn = () => {
    // Позволяем вызывать метод даже если эффект в процессе выполнения,
    // но защищаем от повторного входа в базовую очистку
    const alreadyDisposed = effectNode.isDisposed
    effectNode.isDisposed = true

    // Каскадно уничтожаем всех вложенных детей
    ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
    ownedEffects.clear()

    // Вызываем колбэки отписки только если это был первичный внешний вызов dispose
    if (!alreadyDisposed) {
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

  effectNode.dispose = disposeFn
  return disposeFn
}
