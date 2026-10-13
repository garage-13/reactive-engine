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
<<<<<<< Updated upstream
  
  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  
=======

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()

>>>>>>> Stashed changes
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

  // 🟢 КАНОНИЧЕСКИЙ ТОПОЛОГИЧЕСКИЙ ВАЛИДАТОР ГРАФА (Сверху Вниз)
  // Рекурсивно проверяет родителей и возвращает true, если выше по цепочке была хоть одна мутация.
  const checkUpstreamModifications = (node: any): boolean => {
    if (!node) return false
    const actNode = node._node || node

    // Чисто ленивые цепочки без эффектов (subscribers.size === 0) обязаны всегда рекурсивно
    // опрашивать предков, так как до них ленивое клеймение markDirty физически не долетает!
    const hasActiveSubscribers = actNode.subscribers && actNode.subscribers.size > 0
    if (hasActiveSubscribers && !actNode.versionCheckRequired) {
      return false
    }

    let hasChangedParent = false
    const depsArray = Array.from(actNode.dependencies || [])

    // 1. ФАЗА 1: Рекурсивно погружаемся в дедушек до самых корней графа
    for (const dep of depsArray) {
      const rawDep = (dep as any)._node || dep
      if (rawDep.type === 'computed' && (rawDep.versionCheckRequired || !hasActiveSubscribers)) {
        checkUpstreamModifications(rawDep)
      }
    }

    // 2. ФАЗА 2: Атомарно сверяем версии рёбер графа строго после схождения верхних каскадов.
    // Временная подмена activeConsumer гарантирует кристальную чистоту Dynamic Deps!
    const savedConsumer = engine.activeConsumer
    for (const dep of depsArray) {
      const rawDep = (dep as any)._node || dep

      if (rawDep.type === 'computed' && (rawDep.isDirty || rawDep.versionCheckRequired || !hasActiveSubscribers)) {
        engine.activeConsumer = rawDep
        try {
          rawDep.run()
        } finally {
          engine.activeConsumer = savedConsumer
        }
      }

      const currentVer = rawDep.version !== undefined ? rawDep.version : ((dep as any).version !== undefined ? (dep as any).version : engine.epoch)

      // СИНХРОНИЗАЦИЯ РЕБРА СВЯЗИ ВРЕМЕНИ ГРАФА:
      // Сверяем актуальную версию родителя со старым слепком в депо-версиях ребенка.
      if (!actNode.depVersions.has(dep) || currentVer !== actNode.depVersions.get(dep)) {
        hasChangedParent = true
      }

      // Атомарно перезаписываем свежую актуальную версию родителя в локальный слепок ребенка,
      // намертво защищая глубокие ленивые матрешки от протухания кэша!
      actNode.depVersions.set(dep, currentVer)
    }
    engine.activeConsumer = savedConsumer

    actNode.versionCheckRequired = false
    return hasChangedParent
  }

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
<<<<<<< Updated upstream
      
=======

      const oldDeps = Array.from(dependencies)
      const oldVersions = new Map(depVersions)

>>>>>>> Stashed changes
      dependencies.forEach(dep => {
        const rawDepNode = dep._node || dep
        if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
      })
      dependencies.clear()
      depVersions.clear()

      try {
        const newValue = fn()
        const isObj = (value && typeof value === 'object') || (newValue && typeof newValue === 'object')
<<<<<<< Updated upstream
        
        // КРИСТАЛЬНО ЧИСТОЕ СРАВНЕНИЕ ИЗМЕНЕНИЙ ПО ЗНАЧЕНИЮ (Value Equality)
        const changed = isDirty || isObj || value !== newValue
        
=======

        // КРИСТАЛЬНО ЧИСТОЕ СРАВНЕНИЕ ИЗМЕНЕНИЙ ПО ЗНАЧЕНИЮ (Value Equality)
        const changed = isDirty || isObj || value !== newValue

>>>>>>> Stashed changes
        if (changed) {
          const previousValueSnapshot = isDirty ? undefined : (typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value)
          value = newValue
          version++ // Растет строго при фактическом изменении значения!
<<<<<<< Updated upstream
          
=======

          if (engine.log) {
            engine.log({
              type: 'computed',
              label: signalName || `computed:[${fn.name || computedNode.id}]`,
              details: { from: previousValueSnapshot, to: newValue }
            })
          }

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
          // Синхронизируем мапы версий у подписчиков, сообщая им о стабильности ребра графа
=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        
        isDirty = false
        versionCheckRequired = false
        
=======

        isDirty = false
        versionCheckRequired = false

>>>>>>> Stashed changes
        let maxDepDepth = 0
        let hasSameDeps = dependencies.size === oldDeps.length

        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          const currentVer = rawNode.version !== undefined ? rawNode.version : (dep.version !== undefined ? dep.version : engine.epoch)
          depVersions.set(dep, currentVer)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) maxDepDepth = rawNode.depth
          if (hasSameDeps && !oldDeps.includes(dep)) hasSameDeps = false
        })

        // ПАТТЕРН МЕЖКАДРОВОЙ СИНХРОНИЗАЦИИ: Если состав родителей стабилен, мы восстанавливаем
        // точные числовые тайминги версий из старого кадра, спасая длинные ленивые цепочки!
        if (hasSameDeps && oldVersions.size > 0) {
          oldVersions.forEach((ver, dep) => {
            if (depVersions.has(dep)) {
              const rawNode = dep._node || dep
              depVersions.set(dep, rawNode.version !== undefined ? rawNode.version : ver)
            }
          })
        } else if (!hasSameDeps && oldVersions.size > 0) {
          oldVersions.forEach((ver, dep) => {
            if (depVersions.has(dep)) {
              const rawNode = dep._node || dep
              depVersions.set(dep, rawNode.version !== undefined ? rawNode.version : ver)
            }
          })
        }

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
<<<<<<< Updated upstream
      
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
      
=======

      // 1. ФАЗА СВЕРХУ ВНИЗ: Рекурсивно опрашиваем родителей, выявляя сквозные мутации версий
      const upstreamChanged = checkUpstreamModifications(computedNode)

      // 2. ВТОРАЯ ФАЗА: Строгая атомарная сверка версий ребер графа строго после Pull каскада
      let needsUpdate = isDirty || upstreamChanged

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      
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
=======

      if (needsUpdate) {
        computedNode.run()
      } else {
        // Логируем холостой проход строго на уровне геттера для полной прозрачной отладки кэша
        if (versionCheckRequired && engine.log) {
          engine.log({
            type: 'computed',
            label: signalName || `computed:[${fn.name || computedNode.id}]`,
            details: { from: value, to: value }
          })
        }
        versionCheckRequired = false
>>>>>>> Stashed changes
        subscribers.forEach(sub => {
          const rawSub = sub._node || sub
          if (rawSub.depVersions) {
            rawSub.depVersions.set(computedInstance, version)
          }
        })
      }
      
      return value
    },
<<<<<<< Updated upstream
=======
    get valueWithoutTracking() { return value },
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  
=======
>>>>>>> Stashed changes
  computedInstance._isDirty = () => isDirty || versionCheckRequired
  computedInstance.type = 'computed'
  computedInstance.run = () => computedNode.run()
  computedNode.destroy = () => {
    engine.computedCache.delete(fn)
  }
  engine.computedCache.set(fn, new WeakRef(computedInstance as any))
  return computedInstance
}
