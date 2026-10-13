import { Computed, CleanupFn } from './types'

export function createComputed<T>(
  engine: any,
  fn: () => T,
  signalName?: string
): Computed<T> {
  const cachedRef = engine.computedCache.get(fn)
  const existing = cachedRef?.deref()
  if (existing) return existing as Computed<T>

  let value: T
  let isDirty = true
  let version = 0
  let isInitialized = false

  // 0 = STABLE, 1 = CHECK, 2 = DIRTY
  let state = 2

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()

  const releaseNode = (node: any): void => {
    if (!node) return
    const actNode = node._node || node
    if (actNode.dependencies && actNode.dependencies.size > 0) {
      const snapshotDeps = Array.from(actNode.dependencies)
      actNode.dependencies.clear()
      if (actNode.depVersions) actNode.depVersions.clear()

      snapshotDeps.forEach((dep: any) => {
        const rawDepNode = dep._node || dep
        if (rawDepNode.subscribers) {
          rawDepNode.subscribers.delete(actNode)
          rawDepNode.subscribers.delete(node)
          rawDepNode.subscribers.delete(computedNode)
          if (rawDepNode.type === 'computed' && rawDepNode.subscribers.size === 0) {
            releaseNode(rawDepNode)
          }
        }
      })
    }
  }

  const subscribers = new class extends Set<any> {
    override delete(val: any): boolean {
      const res = super.delete(val)
      if (this.size === 0) {
        state = 2
        isDirty = true
        isInitialized = false
        releaseNode(computedNode)
        engine.computedCache.delete(fn)
      }
      return res
    }
  }()

  // ⚡ ЭТАЛОННЫЙ АПДЕЙТЕР ГРАФА ПО ВЕРСИЯМ РОДИТЕЛЕЙ (Pull)
  const updateIfNecessary = (node: any): boolean => {
    // 1. Холодный старт
    if (!isInitialized) {
      return node.run()
    }

    // 🌟 ДОБАВИТЬ ЭТОТ БЛOК: Если прилетела прямая грязь от сигнала — вычисляем сразу
    if (node.state === 2) {
      return node.run()
    }

    // 2. Проверка каскада CHECK
    if (node.state === 1) {
      let hasChangedParent = false

      for (const dep of Array.from(node.dependencies)) {
        const rawDep = (dep as any)._node || dep
        if (rawDep.type === 'computed' && rawDep.state > 0) {
          updateIfNecessary(rawDep)
        }
      }

      for (const dep of Array.from(node.dependencies)) {
        const rawDep = (dep as any)._node || dep
        if (node.depVersions.get(dep) !== rawDep.version) {
          hasChangedParent = true
          break
        }
      }

      node.state = 0

      if (hasChangedParent || isDirty) {
        return node.run()
      }

      return false
    }

    return false
  }

  const computedNode: any = {
    id: engine.subscriberId++,
    dependencies,
    subscribers,
    depth: 1,
    type: 'computed',
    fn,
    get version() { return version },
    get state() { return state },
    set state(val: number) { state = val },
    get depVersions() { return depVersions },
    update: () => {
      return updateIfNecessary(computedNode)
    },
    run: () => {
      if (engine.cycleDetectionStack.has(computedNode)) throw new Error('[Graph Error] Cyclic dependency detected')
      engine.cycleDetectionStack.add(computedNode)

      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = computedNode

      // 🎯 ЧЕСТНЫЙ DIFF ЗАВИСИМОСТЕЙ БЕЗ ВСЛЕПУЮ ОЧИСТКИ (Канонический Паттерн)
      // Сохраняем слепок старых зависимостей, не удаляя их из подписчиков родителей раньше времени!
      const oldDeps = new Set(dependencies)
      dependencies.clear()

      try {
        const newValue = fn()

        // Отписываемся ТОЛЬКО от тех старых зависимостей, которые не нарисовались в новом запуске fn()
        oldDeps.forEach(dep => {
          if (!dependencies.has(dep)) {
            const rawDepNode = dep._node || dep
            if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
            depVersions.delete(dep)
          }
        })

        // Строгое эталонное сравнение по ссылке
        const changed = isDirty || !Object.is(value, newValue)

        if (changed) {
          const previousValueSnapshot = isDirty ? undefined : (typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value)
          value = newValue
          version++ // Растет строго при фактическом изменении значения!

          if (engine.log) {
            engine.log({
              type: 'computed',
              label: signalName || `computed:[${fn.name || computedNode.id}]`,
              details: { from: previousValueSnapshot, to: newValue }
            })
          }

          subscribers.forEach(sub => {
            const rawSub = sub._node || sub
            if (rawSub.type === 'effect') {
              rawSub.state = 2 // Эффекты переводим в DIRTY
              rawSub.isDirty = true
              engine.pendingEffects.add(sub)
            } else {
              if (rawSub.markDirty) rawSub.markDirty(1) // computed переводят потомков в CHECK (1)
            }
          })
        }

        isDirty = false
        state = 0
        isInitialized = true

        let maxDepDepth = 0
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) maxDepDepth = rawNode.depth
        })

        // Синхронизация слепков версий подписчиков
        subscribers.forEach(sub => {
          const rawSub = sub._node || sub
          if (rawSub.depVersions) {
            rawSub.depVersions.set(computedInstance, version)
          }
        })

        computedNode.depth = maxDepDepth + 1
        return changed
      } finally {
        engine.activeConsumer = prevConsumer
        engine.cycleDetectionStack.delete(computedNode)
      }
    },
    markDirty: (parentState: number) => {
      if (state >= parentState) return

      state = parentState

      subscribers.forEach(sub => {
        const rawSub = sub._node || sub
        if (rawSub.type === 'effect') {
          rawSub.isDirty = true
          engine.pendingEffects.add(sub)
        }
        if (rawSub.markDirty) {
          rawSub.markDirty(1)
        }
      })
    }
  }

  const computedInstance: Computed<T> = {
    get value() {
      // Регистрируем зависимость, если этот computed считывается внутри другого computed или эффекта
      if (engine.activeConsumer && engine.activeConsumer !== computedNode) {
        computedNode.subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(computedNode)
      }

      // Атомарно запускаем pull-алгоритм ленивой проверки версий родителей
      updateIfNecessary(computedNode)

      // Синхронизируем числовой слепок версии для активного консьюмера
      if (engine.activeConsumer && engine.activeConsumer.depVersions) {
        engine.activeConsumer.depVersions.set(computedInstance, version)
      }

      // Железобетонно отдаем закэшированное значение без фантомных перезапусков!
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

  engine.computedCache.set(fn, new WeakRef(computedInstance as any))
  return computedInstance
}
