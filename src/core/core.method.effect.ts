import { IEffect, EffectFn, CleanupFn } from './types'

interface ICoreEffectNode extends IEffect {
  dependencies: Set<any>;
  depVersions: Map<any, number>;
  ownedEffects: Set<ICoreEffectNode>;
  type: string;
  depth: number;
  state: number;
  _node: any;
  dispose: () => void;
}

export function createEffect(engine: any, fn: EffectFn, effectName?: string): () => void {
  let isDisposed = false
  let isRunning = false
  let state = 2 // 0 = STABLE, 1 = CHECK, 2 = DIRTY

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<ICoreEffectNode>()

  const runCleanupPhase = () => {
    // Каскадное уничтожение вложенных детей
    if (ownedEffects.size > 0) {
      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner
      engine.activeConsumer = null
      engine.activeOwner = null
      ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
      ownedEffects.clear()
      engine.activeConsumer = prevConsumer
      engine.activeOwner = prevOwner
    }

    // Изоляция ошибок в деструкторах пользователя
    if (effectNode.cleanups.size > 0) {
      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = null

      effectNode.cleanups.forEach(cleanup => {
        try {
          cleanup()
        } catch (err) {
          console.error(err)
        }
      })

      effectNode.cleanups.clear()
      engine.activeConsumer = prevConsumer
    }
  }

  const effectNode: ICoreEffectNode = {
    id: engine.subscriberId++,
    dependencies,
    ownedEffects,
    cleanups: new Set<CleanupFn>(),
    type: 'effect',
    depth: 0,
    label: effectName,

    get isDirty(): boolean { return state > 0 },
    set isDirty(val: boolean) { if (val) state = 2 },

    get isDisposed(): boolean { return isDisposed },
    set isDisposed(val: boolean) { isDisposed = val },

    get state(): number { return state },
    set state(val: number) { state = val },
    get depVersions(): Map<any, number> { return depVersions },
    get _node(): any { return effectNode },

    markDirty: () => {
      if (state >= 1) return
      state = 1
      engine.pendingEffects.add(effectNode)
    },

    run: () => {
      if (isDisposed || isRunning) return
      isRunning = true

      runCleanupPhase()

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      engine.activeConsumer = effectNode
      engine.activeOwner = effectNode

      const oldDeps = new Set(dependencies)
      dependencies.clear()

      try {
        state = 0

        const result = fn()
        if (typeof result === 'function') {
          effectNode.cleanups.add(result)
        }

        oldDeps.forEach(dep => {
          if (!dependencies.has(dep)) {
            const rawDepNode = dep._node || dep
            if (rawDepNode.subscribers) rawDepNode.subscribers.delete(effectNode)
            depVersions.delete(dep)
          }
        })

        let maxDepDepth = 0
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.subscribers) rawNode.subscribers.add(effectNode)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) {
            maxDepDepth = rawNode.depth
          }
        })
        effectNode.depth = maxDepDepth + 1

      } finally {
        isRunning = false
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
      }
    },

    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      effectNode.isDisposed = true

      runCleanupPhase()

      dependencies.forEach(dep => {
        const rawNode = dep._node || dep
        if (rawNode.subscribers) rawNode.subscribers.delete(effectNode)
      })
      dependencies.clear()
      depVersions.clear()
    }
  }

  // Распаковываем прокси инстанса адаптера сайта для безопасной иерархической регистрации
  const actualOwnerNode = engine.activeOwner ? (engine.activeOwner._node || engine.activeOwner) : null

  if (actualOwnerNode && actualOwnerNode.ownedEffects) {
    actualOwnerNode.ownedEffects.add(effectNode)
  }

  effectNode.run()

  return () => {
    effectNode.dispose()
  }
}
