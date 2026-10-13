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
  let versionCheckRequired = false
  
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
        isDirty = true
        versionCheckRequired = true
        releaseNode(computedNode)
        engine.computedCache.delete(fn)
      }
      return res
    }
  }()

  const computedNode: any = {
    id: engine.subscriberId++,
    dependencies,
    subscribers,
    depth: 1,
    type: 'computed',
    fn,
    get version() { return version },
    get versionCheckRequired() { return versionCheckRequired },
    set versionCheckRequired(val: boolean) { versionCheckRequired = val },
    get depVersions() { return depVersions },
    run: () => {
      if (engine.cycleDetectionStack.has(computedNode)) throw new Error('[Graph Error] Cyclic dependency detected')
      engine.cycleDetectionStack.add(computedNode)
      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = computedNode
      
      dependencies.forEach(dep => {
        const rawDepNode = dep._node || dep
        if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
      })
      dependencies.clear()
      depVersions.clear()
      
      try {
        const newValue = fn()
        const isObj = (value && typeof value === 'object') || (newValue && typeof newValue === 'object')
        
        // КРИСТАЛЬНО ЧИСТОЕ СРАВНЕНИЕ ИЗМЕНЕНИЙ ПО ЗНАЧЕНИЮ (Value Equality)
        const changed = isDirty || isObj || value !== newValue
        
        if (changed) {
          value = newValue
          version++ // Растет строго при фактическом изменении значения!
          
          subscribers.forEach(sub => {
            const rawSub = sub._node || sub
            rawSub.isDirty = true
            if (rawSub.type === 'effect') {
              engine.pendingEffects.add(sub)
            }
            if (rawSub.markDirty) rawSub.markDirty()
          })
        } else {
          // VALUE EQUALITY CUT: Значение примитива не изменилось!
          // Синхронизируем мапы версий у подписчиков, сообщая им о стабильности ребра графа
          subscribers.forEach(sub => {
            const rawSub = sub._node || sub
            if (rawSub.depVersions) {
              rawSub.depVersions.set(computedInstance, version)
            }
            if (rawSub.type === 'effect') {
              rawSub.isDirty = false
              engine.pendingEffects.delete(sub)
            }
          })
        }
        
        isDirty = false
        versionCheckRequired = false
        
        let maxDepDepth = 0
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version !== undefined ? rawNode.version : engine.epoch)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) maxDepDepth = rawNode.depth
        })
        computedNode.depth = maxDepDepth + 1
        return changed
      } finally {
        engine.activeConsumer = prevConsumer
        engine.cycleDetectionStack.delete(computedNode)
      }
    },
    markDirty: () => {
      if (!versionCheckRequired) {
        versionCheckRequired = true
        subscribers.forEach(sub => {
          const rawSub = sub._node || sub
          rawSub.isDirty = true
          if (rawSub.type === 'effect') {
            engine.pendingEffects.add(sub)
          }
          if (rawSub.markDirty) rawSub.markDirty()
        })
      }
    }
  }

  const computedInstance: Computed<T> = {
    get value() {
      if (engine.activeConsumer && engine.activeConsumer !== computedNode) {
        computedNode.subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(computedNode)
      }
      
      // 1. ФАЗА СВЕРХУ ВНИЗ: Рекурсивно будим родителей, заставляя их обновиться (Pull)
      if (versionCheckRequired && dependencies.size > 0) {
        for (const dep of Array.from(dependencies)) {
          const rawNode = (dep as any)._node || dep
          if (rawNode.type === 'computed' && rawNode._node?.versionCheckRequired) {
            const _forcedParentPull = dep.value // Чтение геттера сохраняет Dynamic Deps контексты!
          }
        }
      }
      
      // 2. ВТОРАЯ ФАЗА: Строгая атомарная сверка версий ребер графа строго после Pull каскада
      let needsUpdate = isDirty
      let parentChanged = false
      
      if (!needsUpdate && dependencies.size > 0) {
        for (const dep of Array.from(dependencies)) {
          const rawNode = (dep as any)._node || dep
          const currentVer = rawNode.version !== undefined ? rawNode.version : (dep.version !== undefined ? dep.version : engine.epoch)
          if (currentVer !== depVersions.get(dep)) {
            needsUpdate = true
            parentChanged = true
            break
          }
        }
      }
      
      // Исполняем вычисление функции, только если зафиксировано реальное изменение предков
      // или если у текущего узла взведен флаг проверки, но его родители пересчитались
      if (needsUpdate || versionCheckRequired) {
        const computedChanged = computedNode.run()
        
        // 🟢 КАСКАДНОЕ СКВОЗНОЕ ТУШЕНИЕ (Bi-Directional Pruning):
        // Если наша функция выполнилась, но значение примитива осталось ПРЕЖНИМ,
        // мы обязаны принудительно обновить слепок нашей версии в мапах depVersions детей.
        // Это предотвратит рассинхронизацию кэша на нисходящих итерациях цикла!
        if (!computedChanged) {
          subscribers.forEach(sub => {
            const rawSub = sub._node || sub
            if (rawSub.depVersions) {
              rawSub.depVersions.set(computedInstance, version)
            }
          })
        }
      } else {
        versionCheckRequired = false
        // Если мы проверили родителей и они стабильны, мы также транслируем свою стабильность детям
        subscribers.forEach(sub => {
          const rawSub = sub._node || sub
          if (rawSub.depVersions) {
            rawSub.depVersions.set(computedInstance, version)
          }
        })
      }
      
      return value
    },
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
  
  computedInstance._isDirty = () => isDirty || versionCheckRequired
  computedInstance.type = 'computed'
  computedInstance.run = () => computedNode.run()
  
  computedNode.destroy = () => {
    engine.computedCache.delete(fn)
  }

  engine.computedCache.set(fn, new WeakRef(computedInstance as any))
  return computedInstance
}
