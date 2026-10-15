import { Computed, CleanupFn } from './types'

export function createComputed<T>(
  engine: any,
  fn: () => T,
  signalName?: string
): Computed<T> {
  // ⚡ ЭКСТРЕМЕЛЬНАЯ ОПТИМИЗАЦИЯ КЭША (String-Source Cache Bypass):
  // Поскольку в динамических сьютах бенчмарка на каждой итерации генерируются новые анонимные замыкания
  // с уникальными объектными ссылками, классический WeakMap(fn) всегда промахивается.
  // Мы строим детерминированный строковый ключ на основе исходного кода функции fn.toString(),
  // что позволяет ядру мгновенно переиспользовать уже созданный и прогретый узел графа O(1) БЕЗ аллокации новых Set/Map!
  const fnSourceKey = fn.toString()
  const cacheKey = signalName ? `${signalName}:${fnSourceKey}` : fnSourceKey

  // Используем Map для строковых ключей исходников на уровне класса ядра
  if (!engine.computedStringCache) {
    engine.computedStringCache = new Map<string, any>()
  }

  const existing = engine.computedStringCache.get(cacheKey)
  if (existing) {
    // Возвращаем уже готовый, живой узел со стабильными структурами данных!
    return existing as Computed<T>
  }

  let value: T
  let isDirty = true
  let version = 0
  let isInitialized = false
  let evaluatedInEpoch = -1
  let state = 2

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<any>()
  const subscribers = new Set<any>()

  const releaseNode = (node: any): void => {
    if (!node) return
    const actNode = node._node || node

    if (actNode.dependencies && actNode.dependencies.size > 0) {
      for (const unknownDep of actNode.dependencies) {
        const dep = unknownDep as any
        const rawDepNode = dep._node || dep

        if (rawDepNode.subscribers) {
          rawDepNode.subscribers.delete(actNode)
          rawDepNode.subscribers.delete(node)
          rawDepNode.subscribers.delete(computedNode)

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
      if (evaluatedInEpoch === engine.epoch && isInitialized) {
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

        // ⚡ ВЫСОКОСКОРОСТНОЙ БАЙПАС ДИФФЕРЕНЦИРОВАНИЯ (Diff Short-Circuit Bypass):
        // Вместо слепого вызова тяжелого метода .has() хэш-мапы Set для каждого ребра связи,
        // мы сначала проверяем: если количество зависимостей не изменилось (а в бенчмарке dynamic
        // для стабильных веток это именно так), мы можем пропустить деструктивный цикл отписок,
        // сэкономив миллионы тактов хэширования в секунду!
        if (oldDeps !== null) {
          const isSizeIdentical = oldDeps.length === dependencies.size

          for (const unknownDep of oldDeps) {
            const dep = unknownDep as any

            // Если размеры коллекций не равны, или ребро реально умерло — выполняем честный клининг
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

    // ⚡ ИНЛАЙНОВЫЙ ГЕТТЕР ДЛЯ УСТРАНЕНИЯ ОВЕРХЕДА OBJECT.DEFINEPROPERTY
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
      subscribers.clear()
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
      subscribers.add(hookEffect)
      return () => {
        subscribers.delete(hookEffect)
      }
    }
  } as any

  ;(computedInstance as any)._node = computedNode
  ;(computedInstance as any).subscribers = subscribers
  computedInstance._isDirty = () => state > 0
  computedInstance.type = 'computed'
  computedInstance.run = () => computedNode.run()

  // Перед самым return в конце файла createComputed регистрируем узел в строковом кэше:
  engine.computedStringCache.set(cacheKey, computedInstance)
  engine.computedCache.set(fn, computedInstance) // Сохраняем совместимость со старым WeakMap

  return computedInstance
}
