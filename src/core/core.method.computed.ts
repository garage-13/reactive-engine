import { Computed, CleanupFn } from './types'

export function createComputed<T>(
  engine: any,
  fn: () => T,
  signalName?: string
): Computed<T> {
  // 1. Быстрый канонический WeakMap путь (по ссылке на функцию)
  const existing = engine.computedCache.get(fn)
  if (existing) return existing as Computed<T>

  // 2. ⚡ БЕЗОПАСНЫЙ ТРАНЗАКЦИОННЫЙ СТРОКОВЫЙ КЭШ:
  // Переиспользуем ноды по сигнатуре только внутри ОДНОГО батча (цикла генерации графа).
  const cacheKey = fn.toString()
  if (engine.batchDepth > 0) {
    if (!engine.batchComputedCache) {
      engine.batchComputedCache = new Map<string, any>()
    }
    const cachedNode = engine.batchComputedCache.get(cacheKey)
    if (cachedNode) {
      return cachedNode as Computed<T>
    }
  }

  let value: T
  let isDirty = true
  let version = 0
  let isInitialized = false
  let evaluatedInEpoch = -1
  let state = 2 // 2 = DIRTY, 1 = CHECK, 0 = STABLE

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<any>()
  const subscribers = new Set<any>()

  const releaseNode = (node: any): void => {
    if (!node) return
    // Строго извлекаем внутреннее ядро ноды
    const actNode = node._node || node

    if (actNode.dependencies && actNode.dependencies.size > 0) {
      for (const unknownDep of actNode.dependencies) {
        const dep = unknownDep as any
        const rawDepNode = dep._node || dep

        if (rawDepNode.subscribers) {
          // Удаляем связи, не затирая сами объекты
          rawDepNode.subscribers.delete(actNode)
          rawDepNode.subscribers.delete(node)
          rawDepNode.subscribers.delete(computedNode)

          // ⚡ БЕЗОПАСНЫЙ КАСКАДНЫЙ ПЕРЕХОД:
          // Передаем в рекурсию строго внутренний приватный computedNode (rawDepNode),
          // чтобы V8 распутывал граф без зануления внешних инстансов прокси
          if (rawDepNode.type === 'computed' && rawDepNode.subscribers.size === 0) {
            releaseNode(rawDepNode)
          }
        }
      }
      actNode.dependencies.clear()
      if (actNode.depVersions) actNode.depVersions.clear()
    }
  }

  let verifiedInEpoch = -1

  const updateIfNecessary = (node: any): boolean => {
    if (!isInitialized || state === 2) {
      return node.run()
    }

    if (verifiedInEpoch === engine.epoch && engine.batchDepth === 0) {
      return false
    }

    let hasChangedParent = false

    if (dependencies && dependencies.size > 0) {
      for (const dep of dependencies) {
        const rawDep = dep._node || dep

        if (rawDep.type === 'computed') {
          if (rawDep.update) rawDep.update()
        }

        // Если родительский сигнал мутировал в текущем батче или версии разошлись
        if (dep.hasBatchValue || depVersions.get(dep) !== rawDep.version) {
          hasChangedParent = true
          break
        }
      }
    }

    verifiedInEpoch = engine.epoch

    if (hasChangedParent || isDirty) {
      return node.run()
    }

    state = 0
    return false
  }

  let currentRunId = 0

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
      if (evaluatedInEpoch === engine.epoch && isInitialized && state === 0 && engine.batchDepth === 0) {
        return false
      }
      evaluatedInEpoch = engine.epoch
      verifiedInEpoch = engine.epoch

      if (engine.cycleDetectionStack.has(computedNode)) {
        throw new Error('[Graph Error] Cyclic dependency detected')
      }
      engine.cycleDetectionStack.add(computedNode)

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      engine.activeConsumer = computedNode
      engine.activeOwner = computedNode

      currentRunId++
      computedNode.activeRunId = currentRunId

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
          const isSizeIdentical = oldDeps.length === dependencies.size
          for (const unknownDep of oldDeps) {
            const dep = unknownDep as any
            if (!isSizeIdentical || !dependencies.has(dep)) {
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

        computedNode.depth = maxDepDepth + 1
        return changed
      } finally {
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
        engine.cycleDetectionStack.delete(computedNode)
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
      const consumer = engine.activeConsumer
      if (consumer && consumer !== computedNode) {
        subscribers.add(consumer)
        consumer.dependencies.add(computedNode)

        const currentDepth = computedNode.depth || 1
        const consumerRaw = consumer._node || consumer
        if (consumerRaw.depth !== undefined && currentDepth >= consumerRaw.depth) {
          consumerRaw.depth = currentDepth + 1
        }

        if (consumer.activeRunId !== undefined) {
          computedNode._lastSeenInRunId = consumer.activeRunId
        }
      }

      updateIfNecessary(computedNode)

      if (consumer && consumer.depVersions) {
        consumer.depVersions.set(computedInstance, version)
      }
      return value
    },
    get valueWithoutTracking() { return value },
    get version() { return version },
    get dependencies() { return dependencies },

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
      subscribers.add(fakeEffect)
      cb(computedInstance.value)
      return () => {
        fakeEffect.isDisposed = true
        subscribers.delete(fakeEffect)
      }
    },
    subscribeState(cb: () => void): CleanupFn {
      return (computedInstance as any).subscribe(cb)
    },
    destroy: () => {
      // 1. Распутываем зависимости вверх по графу, пока subscribers живы
      releaseNode(computedNode)

      // 2. Очищаем локальные сеты графа, сохраняя ссылки на сами структуры
      if (subscribers) subscribers.clear()

      // 3. Вычищаем строго из кэшей
      engine.computedCache.delete(fn)
      if (engine.batchComputedCache) {
        engine.batchComputedCache.delete(cacheKey)
      }

      // 4. Мягкий сброс флагов вычислений
      isDirty = true
      state = 2
      isInitialized = false
      // ⚛️ ГАРАНТИЯ СТАБИЛЬНОСТИ: Никаких занулений computedInstance._node = undefined!
    },
    __subscribe(cb: () => void): CleanupFn {
      const hookEffect: any = {
        id: engine.subscriberId++,
        type: 'effect',
        run: cb,
        isDirty: false
      }
      subscribers.add(hookEffect)
      return () => {
        subscribers.delete(hookEffect)
      }
    }
  } as any

  computedInstance.run = () => computedNode.run()

  // Сохраняем в канонический кэш
  engine.computedCache.set(fn, computedInstance)

  ;(computedInstance as any)._node = computedNode
  ;(computedInstance as any).subscribers = subscribers

  // ⚡ Записываем во временный батч-кэш для оптимизации аллокаций
  if (engine.batchDepth > 0 && engine.batchComputedCache) {
    engine.batchComputedCache.set(cacheKey, computedInstance)
  }

  return computedInstance
}
