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
    // Каскадное уничтожение вложенных детей через быстрый for...of
    if (ownedEffects.size > 0) {
      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner
      engine.activeConsumer = null
      engine.activeOwner = null

      for (const child of ownedEffects) {
        if (child.dispose) child.dispose()
      }
      ownedEffects.clear()

      engine.activeConsumer = prevConsumer
      engine.activeOwner = prevOwner
    }

    // Изоляция ошибок в деструкторах пользователя через быстрый for...of
    if (effectNode.cleanups.size > 0) {
      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = null

      for (const cleanup of effectNode.cleanups) {
        try {
          cleanup()
        } catch (err) {
          console.error(err)
        }
      }

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
      engine.scheduleEffect(effectNode)
    },

    run: () => {
      if (isDisposed || isRunning) return
      isRunning = true

      runCleanupPhase()

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      engine.activeConsumer = effectNode
      engine.activeOwner = effectNode

      // ⚡ ОПТИМИЗАЦИЯ: Вместо тяжелого new Set(dependencies) стягиваем данные в плоский массив
      const oldDeps = dependencies.size > 0 ? Array.from(dependencies) : null
      dependencies.clear() // Очищаем, чтобы геттеры собрали только живые зависимости кадра

      try {
        state = 0

        const result = fn()
        if (typeof result === 'function') {
          effectNode.cleanups.add(result)
        }

        // ⚡ ОПТИМИЗАЦИЯ: Инкрементальный дифф связей через быстрый плоский for...of по массиву
        if (oldDeps !== null) {
          for (const unknownDep of oldDeps) {
            const dep = unknownDep as any
            if (!dependencies.has(dep)) {
              const rawDepNode = dep._node || dep
              if (rawDepNode.subscribers) rawDepNode.subscribers.delete(effectNode)
              depVersions.delete(dep)
            }
          }
        }

        let maxDepDepth = 0
        // ⚡ ОПТИМИЗАЦИЯ: Быстрый for...of для обновления версий ребер графа
        for (const unknownDep of dependencies) {
          const dep = unknownDep as any
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.subscribers) rawNode.subscribers.add(effectNode)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) {
            maxDepDepth = rawNode.depth
          }
        }
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

      // ⚡ ОПТИМИЗАЦИЯ: Замена .forEach на быстрый for...of при полном уничтожении эффекта
      for (const dep of dependencies) {
        const rawNode = dep._node || dep
        if (rawNode.subscribers) rawNode.subscribers.delete(effectNode)
      }
      dependencies.clear()
      depVersions.clear()
    }
  }

  const actualOwnerNode = engine.activeOwner ? (engine.activeOwner._node || engine.activeOwner) : null

  if (actualOwnerNode && actualOwnerNode.ownedEffects) {
    actualOwnerNode.ownedEffects.add(effectNode)
  }

  effectNode.run()

  return () => {
    effectNode.dispose()
  }
}
