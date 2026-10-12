import { Computed, CleanupFn } from './types'

/**
 * Изолированная фабрика computed-узлов реактивного графа.
 * Гарантирует O(1) кэширование, ленивые вычисления и стабильный каскадный Garbage Collection.
 */
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
  
  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  
  // Канонический рекурсивный сборщик мертвых связей графа (Cascade GC)
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

  // Строго типизированный кастомный Set подписчиков с GC-триггером на уровне ноды ядра
  const subscribers = new class extends Set<any> {
    override delete(val: any): boolean {
      const res = super.delete(val)
      if (this.size === 0) {
        isDirty = true
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
    run: () => {
      if (engine.cycleDetectionStack.has(computedNode)) throw new Error('[Graph Error] Cyclic dependency detected')
      engine.cycleDetectionStack.add(computedNode)
      const prevConsumer = engine.activeConsumer
      engine.activeConsumer = computedNode
      
      // Динамическое ленивое отсечение старых ребер перед каждым пересчетом (Dynamic Deps)
      dependencies.forEach(dep => {
        const rawDepNode = dep._node || dep
        if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
      })
      dependencies.clear()
      depVersions.clear()
      
      try {
        const newValue = fn()
        const isObj = value && typeof value === 'object'
        const changed = isDirty || (!isObj && value !== newValue) || (isObj && JSON.stringify(value) !== JSON.stringify(newValue))
        
        if (changed) {
          value = newValue
          version++
          
          subscribers.forEach(sub => {
            sub.isDirty = true
            engine.pendingEffects.add(sub)
          })
        } else {
          subscribers.forEach(sub => {
            sub.isDirty = false
          })
        }
        isDirty = false
        
        // 🟢 ИСПРАВЛЕНО (Dynamic Deps & #22): Фиксируем слепки версий СТРОГО внутри run(),
        // когда актуальный граф зависимостей текущего кадра сформирован окончательно.
        // Мапа depVersions всегда содержит только живые ребра без фантомных хвостов!
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
      if (!isDirty) {
        isDirty = true
        subscribers.forEach(sub => {
          const wasDirty = sub.isDirty
          sub.isDirty = true
          engine.pendingEffects.add(sub)
          if (!wasDirty && sub.subscribers) {
            sub.subscribers.forEach((s: any) => {
              s.isDirty = true
              engine.pendingEffects.add(s)
            })
          }
        })
      }
    }
  }

  const computedInstance: Computed<T> = {
    get value() {
      // Регистрируем любой активный консьюмер графа на фазе ленивого Pull-чтения
      if (engine.activeConsumer && engine.activeConsumer !== computedNode) {
        computedNode.subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(computedNode)
      }
      
      let needsUpdate = isDirty
      
      // Сверяем сохраненные версии зависимостей. Если родитель изменился, версия не совпадет
      if (!needsUpdate && dependencies.size > 0) {
        for (const dep of Array.from(dependencies)) {
          const rawNode = (dep as any)._node || dep
          const currentVer = rawNode.version !== undefined ? rawNode.version : (dep.version !== undefined ? dep.version : engine.epoch)
          if (currentVer !== depVersions.get(dep)) {
            needsUpdate = true
            break
          }
        }
      }
      
      if (needsUpdate) {
        computedNode.run()
      }
      return value
    },
    get version() {
      return version
    },
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
  
  computedInstance._isDirty = () => isDirty
  computedInstance.type = 'computed'
  computedInstance.run = () => computedNode.run()
  
  computedNode.destroy = () => {
    engine.computedCache.delete(fn)
  }

  engine.computedCache.set(fn, new WeakRef(computedInstance as any))
  return computedInstance
}
