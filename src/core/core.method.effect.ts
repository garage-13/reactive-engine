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
  _snapshotValues: Map<any, any>;
}

export function createEffect(engine: any, fn: EffectFn, effectName?: string): () => void {
  let isDisposed = false
  let isRunning = false
  let isCleaning = false
  let state = 2 // 0 = STABLE, 1 = CHECK, 2 = DIRTY (Гарантированное объявление переменной)

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<ICoreEffectNode>()
  const snapshotValues = new Map<any, any>()

  const runCleanupPhase = () => {
    if (isCleaning) return
    isCleaning = true

    // Активируем контекст чтения исторических снапшотов сигналов
    const prevCleanupNode = engine.activeCleanupNode
    engine.activeCleanupNode = effectNode

    try {
      // 1. Каскадное уничтожение вложенных дочерних эффектов
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

      // 2. Вызов деструкторов пользователя в режиме полной изоляции контекстов tracking/ownership
      if (effectNode.cleanups.size > 0) {
        const prevConsumer = engine.activeConsumer
        const prevOwner = engine.activeOwner // ⚡ ФИКС TDD #222: Запоминаем текущего владельца

        engine.activeConsumer = null
        engine.activeOwner = null // ⚡ ФИКС TDD #222: Изолируем контекст создания для новых эффектов в cleanup

        let firstError: unknown = null
        const cleanupsArray = Array.from(effectNode.cleanups)
        effectNode.cleanups.clear()

        for (const cleanup of cleanupsArray) {
          try {
            cleanup()
          } catch (err) {
            // Ошибки не логируем в console.error по спецификации Suite #17, чтобы не засорять stderr
            if (!firstError) {
              firstError = err
            }
          }
        }

        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner // Восстанавливаем контекст владельца

        if (firstError) {
          throw firstError
        }
      }
    } finally {
      engine.activeCleanupNode = prevCleanupNode
      isCleaning = false
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
    _snapshotValues: snapshotValues,

    get isDirty(): boolean { return state > 0 },
    set isDirty(val: boolean) { if (val) state = 2 },

    get isDisposed(): boolean { return isDisposed },
    set isDisposed(val: boolean) { isDisposed = val },

    get state(): number { return state },
    set state(val: number) { state = val },
    get depVersions(): Map<any, number> { return depVersions },
    get _node(): any { return effectNode },

    markDirty: () => {
      if (isDisposed || state >= 1) return
      state = 1
      engine.scheduleEffect(effectNode)
    },

    run: () => {
      if (isDisposed || isRunning) return
      isRunning = true

      try {
        runCleanupPhase()
      } catch (err) {
        isRunning = false
        throw err
      }

      if (isDisposed) {
        isRunning = false
        return
      }

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      engine.activeConsumer = effectNode
      engine.activeOwner = effectNode

      const oldDeps = dependencies.size > 0 ? Array.from(dependencies) : null
      dependencies.clear()

      try {
        state = 0 // Локальная переменная замыкания теперь успешно сбрасывается в STABLE

        const result = fn()
        if (typeof result === 'function') {
          effectNode.cleanups.add(result)
        }

        if (oldDeps !== null) {
          for (const unknownDep of oldDeps) {
            const dep = unknownDep as any
            if (!dependencies.has(dep)) {
              const rawDepNode = dep._node || dep
              if (rawDepNode.subscribers) rawDepNode.subscribers.delete(effectNode)
              depVersions.delete(dep)
              snapshotValues.delete(dep)
            }
          }
        }

        let maxDepDepth = 0
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

      for (const dep of dependencies) {
        const rawNode = dep._node || dep
        if (rawNode.subscribers) rawNode.subscribers.delete(effectNode)
      }
      dependencies.clear()
      depVersions.clear()
      snapshotValues.clear()
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
