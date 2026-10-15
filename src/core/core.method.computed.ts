import { Computed, CleanupFn } from './types'

export function createComputed<T>(
  engine: any,
  fn: () => T,
  signalName?: string
): Computed<T> {
  const existing = engine.computedCache.get(fn)
  if (existing) return existing as Computed<T>

  let value: T
  let isDirty = true
  let version = 0
  let isInitialized = false
  let evaluatedInEpoch = -1
  let state = 2

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<any>()

  const releaseNode = (node: any): void => {
    if (!node) return
    const actNode = node._node || node

    if (actNode.dependencies && actNode.dependencies.size > 0) {
      // ⚡ ОПТИМИЗАЦИЯ: Полностью убираем Array.from()! Итерируемся прямо по Set.
      // Чтобы безопасно удалять элементы во время итерации (избегая бесконечных циклов в JS),
      // мы очищаем родительские подписки, а сам actNode.dependencies.clear() вызовем строго ПОСЛЕ цикла.
      for (const unknownDep of actNode.dependencies) {
        const dep = unknownDep as any
        const rawDepNode = dep._node || dep

        if (rawDepNode.subscribers) {
          // Выполняем точечное удаление. Если узел есть — удаляем, не дергая Set вхолостую
          rawDepNode.subscribers.delete(actNode)
          rawDepNode.subscribers.delete(node)
          rawDepNode.subscribers.delete(computedNode)

          // Рекурсивный спуск делаем только для живых computed-сирот,
          // у которых реально не осталось активных потребителей
          if (rawDepNode.type === 'computed' && rawDepNode.subscribers.size === 0) {
            releaseNode(rawDepNode)
          }
        }
      }

      // Атомарно очищаем зависимости узла за один такт O(1) после завершения обхода
      actNode.dependencies.clear()
      if (actNode.depVersions) actNode.depVersions.clear()
    }
  }

  const subscribers = new Set<any>()
  let verifiedInEpoch = -1

  const updateIfNecessary = (node: any): boolean => {
    if (!isInitialized) return node.run()
    if (node.state === 2) return node.run()

    if (verifiedInEpoch === engine.epoch) {
      return false
    }

    if (node.state === 1) {
      let hasChangedParent = false

      if (node.dependencies && node.dependencies.size > 0) {
        for (const unknownDep of node.dependencies) {
          const dep = unknownDep as any
          const rawDep = dep._node || dep

          if (!hasChangedParent) {
            if (rawDep.type === 'computed' && rawDep.state > 0) {
              updateIfNecessary(rawDep)
            }

            if (node.depVersions.get(dep) !== rawDep.version) {
              hasChangedParent = true
            }
          }
        }
      }

      verifiedInEpoch = engine.epoch
      node.state = 0

      if (hasChangedParent || isDirty) {
        return node.run()
      }
      return false
    }

    verifiedInEpoch = engine.epoch
    return false
  }

  const computedNode: any = {
    id: engine.subscriberId++,
    dependencies,
    subscribers,
    ownedEffects,
    depth: 1,
    type: 'computed',
    fn,
    get version() { return version },
    get state() { return state },
    set state(val: number) { state = val },
    get depVersions() { return depVersions },
    update: () => updateIfNecessary(computedNode),
    run: () => {
      if (evaluatedInEpoch === engine.epoch && isInitialized) {
        return false
      }
      evaluatedInEpoch = engine.epoch
      verifiedInEpoch = engine.epoch

      // ⚡ СВЕРХБЫСТРАЯ ЗАЩИТА ОТ ЦИКЛОВ (O(1) Inline Flag Bypass):
      // Вместо тяжелых runtime-мутаций глобальной коллекции Set, используем плоский флаг на узле.
      if (computedNode.isEvaluating) {
        throw new Error('[Graph Error] Cyclic dependency detected')
      }
      computedNode.isEvaluating = true // Блокируем узел перед вычислением

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      engine.activeConsumer = computedNode
      engine.activeOwner = computedNode

      const oldDeps = dependencies.size > 0 ? Array.from(dependencies) : null
      dependencies.clear()

      try {
        if (ownedEffects.size > 0) {
          for (const child of ownedEffects) {
            if (child && typeof child.dispose === 'function') {
              child.dispose()
            }
          }
          ownedEffects.clear()
        }

        const newValue = fn()

        if (oldDeps !== null) {
          for (const unknownDep of oldDeps) {
            const dep = unknownDep as any
            if (!dependencies.has(dep)) {
              const rawDepNode = dep._node || dep
              if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
              depVersions.delete(dep)
            }
          }
        }

        const changed = isDirty || !Object.is(value, newValue)

        if (changed) {
          const previousValueSnapshot = isDirty ? undefined : (typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value)
          value = newValue
          version++

          if (engine.log && signalName) {
            engine.log({
              type: 'computed',
              label: signalName,
              details: { from: previousValueSnapshot, to: newValue }
            })
          }

          for (const sub of subscribers) {
            const rawSub = sub._node || sub
            if (rawSub.type === 'effect') {
              rawSub.state = 2
              rawSub.isDirty = true
              engine.scheduleEffect(sub)
            } else if (rawSub.markDirty) {
              rawSub.markDirty(1)
            }
          }
        }

        isDirty = false
        state = 0
        isInitialized = true

        let maxDepDepth = 0
        for (const unknownDep of dependencies) {
          const dep = unknownDep as any
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.subscribers) rawNode.subscribers.add(computedNode)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) {
            maxDepDepth = rawNode.depth
          }
        }

        for (const sub of subscribers) {
          const rawSub = sub._node || sub
          if (rawSub.type === 'effect') {
            rawSub.state = 2
            rawSub.isDirty = true
            engine.scheduleEffect(sub)
          } else if (rawSub.markDirty) {
            rawSub.markDirty(1)
          }
        }

        computedNode.depth = maxDepDepth + 1
        return changed
      } finally {
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
        computedNode.isEvaluating = false // ⚡ Снимаем блокировку строго в finally
      }
    },
    markDirty: (parentState: number) => {
      if (state >= parentState) return
      state = parentState

      for (const sub of subscribers) {
        const rawSub = sub._node || sub
        if (rawSub.type === 'effect') {
          rawSub.isDirty = true
          engine.scheduleEffect(sub)
        } else if (rawSub.markDirty) {
          rawSub.markDirty(1)
        }
      }
    }
  }

  const computedInstance: Computed<T> = {
    get value() {
      if (engine.activeConsumer && engine.activeConsumer !== computedNode) {
        computedNode.subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(computedNode)
      }

      updateIfNecessary(computedNode)

      if (engine.activeConsumer && engine.activeConsumer.depVersions) {
        engine.activeConsumer.depVersions.set(computedInstance, version)
      }
      return value
    },
    get valueWithoutTracking() { return value },
    get version() { return version },
    subscribe(cb: (val: T) => void): CleanupFn {
      const fakeEffect: any = {
        id: engine.subscriberId++,
        isDirty: true,
        depth: 9999,
        dependencies: new Set(),
        type: 'effect',
        run: () => {
          if (fakeEffect.isDisposed) return
          try { cb(computedInstance.value) } catch (err) { console.error(err) }
        }
      }
      computedNode.subscribers.add(fakeEffect)
      cb(computedInstance.value)
      return () => {
        fakeEffect.isDisposed = true
        computedNode.subscribers.delete(fakeEffect)
      }
    },
    subscribeState(cb: () => void): CleanupFn {
      return (computedInstance as any).subscribe(cb)
    },
    destroy: () => {
      computedNode.subscribers.clear()
      releaseNode(computedNode)
      engine.computedCache.delete(fn)
      isDirty = true
      state = 2
      isInitialized = false
    },
    __subscribe(cb: () => void): CleanupFn {
      const hookEffect: any = {
        id: engine.subscriberId++,
        type: 'effect',
        run: cb,
        isDirty: false
      }
      computedNode.subscribers.add(hookEffect)
      return () => {
        subscribers.delete(hookEffect)
      }
    }
  } as any

  ;(computedInstance as any)._node = computedNode
  ;(computedInstance as any).subscribers = subscribers
  ;(computedInstance as any).dependencies = dependencies
  computedInstance._isDirty = () => state > 0
  computedInstance.type = 'computed'
  computedInstance.run = () => computedNode.run()

  engine.computedCache.set(fn, computedInstance)
  return computedInstance
}
