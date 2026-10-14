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

  // Канонический маркер эпохи вычисления кадра графа
  let evaluatedInEpoch = -1

  // 0 = STABLE, 1 = CHECK, 2 = DIRTY
  let state = 2

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()
  const ownedEffects = new Set<any>()

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

  // ⚡ КАНOНИЧЕСКИЙ АПДЕЙТЕР ГРАФА С ПОСЛЕДОВАТЕЛЬНЫМ ПРЕPЫВАНИЕМ (Pull)
  const updateIfNecessary = (node: any): boolean => {
    if (!isInitialized) return node.run()
    if (node.state === 2) return node.run()

    if (node.state === 1) {
      let hasChangedParent = false

      // Опрашиваем родителей ПОСЛЕДOВАТЕЛЬНO, строго по одному!
      for (const dep of Array.from(node.dependencies || [])) {
        const rawDep = (dep as any)._node || dep

        // Рекурсивно погружаемся в родителя, только если предыдущие еще не изменились
        if (!hasChangedParent) {
          if (rawDep.type === 'computed' && rawDep.state > 0) {
            updateIfNecessary(rawDep)
          }

          // Сверяем сохраненный слепок версии ребра с актуальной версией родителя
          if (node.depVersions.get(dep) !== rawDep.version) {
            hasChangedParent = true
            // 🎯 VALUE EQUALITY BREAK: Родитель изменился!
            // Прерываем опрос оставшихся родителей в этом цикле, чтобы не дергать
            // мёртвые ветки (узел c в тесте #193) холосто до перестройки графа!
          }
        }
      }

      // Намертво гасим стейт узла в стабильный (0) ДО вызова run(),
      // пресекая повторные фантомные заходы на чтении геттеров
      node.state = 0

      if (hasChangedParent || isDirty) {
        return node.run() // Пересчитываем узел, что вызовет динамический diff и отписку
      }
      return false // Value Equality Cut
    }
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
      // 1. Быстрый выход, если узел уже актуализирован в рамках текущего кадра эпохи
      if (evaluatedInEpoch === engine.epoch && isInitialized) {
        return false
      }
      evaluatedInEpoch = engine.epoch

      // 2. Пуленепробиваемая защита от циклических зависимостей
      if (engine.cycleDetectionStack.has(computedNode)) {
        throw new Error('[Graph Error] Cyclic dependency detected')
      }
      engine.cycleDetectionStack.add(computedNode)

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      // 3. Выставляем глобальные контексты Ядра строго ДО выполнения функции fn()
      engine.activeConsumer = computedNode
      engine.activeOwner = computedNode

      // 4. Снимаем слепок старых зависимостей перед оценкой
      const oldDeps = new Set(dependencies)
      dependencies.clear()

      try {
        // 🌳 ФИКС КЕЙСА #242: Очищаем вложенные эффекты предыдущего кадра строго ДО оценки fn()
        if (ownedEffects) {
          ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
          ownedEffects.clear()
        }

        // 5. Вычисляем новое значение строго ВНУТРИ изолированного контекста try
        const newValue = fn()

        // 6. Дифференцируем внешние связи графа строго ПОСЛЕ вычисления fn()
        oldDeps.forEach(dep => {
          if (!dependencies.has(dep)) {
            const rawDepNode = dep._node || dep
            if (rawDepNode.subscribers) rawDepNode.subscribers.delete(computedNode)
            depVersions.delete(dep)
          }
        })

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

          subscribers.forEach(sub => {
            const rawSub = sub._node || sub
            if (rawSub.type === 'effect') {
              rawSub.state = 2
              rawSub.isDirty = true
              engine.pendingEffects.add(sub)
            } else if (rawSub.markDirty) {
              rawSub.markDirty(1)
            }
          })
        }

        isDirty = false
        state = 0
        isInitialized = true

        // 7. Актуализируем числовые версии ребер и пересчитываем depth
        let maxDepDepth = 0
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.subscribers) rawNode.subscribers.add(computedNode)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) {
            maxDepDepth = rawNode.depth
          }
        })

        subscribers.forEach(sub => {
          const rawSub = sub._node || sub
          if (rawSub.depVersions) {
            rawSub.depVersions.set(computedInstance, version)
          }
        })

        computedNode.depth = maxDepDepth + 1
        return changed
      } finally {
        // 8. Всегда гарантированно восстанавливаем контексты Ядра в блоке finally
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
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
        } else if (rawSub.markDirty) {
          rawSub.markDirty(1)
        }
      })
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

  engine.computedCache.set(fn, new WeakRef(computedInstance as any))
  return computedInstance
}
