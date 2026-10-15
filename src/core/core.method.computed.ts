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

  // Счечтик итераций:  Мы внедрим маркерную эпоху вычисления прямо на связь.
  // Для этого мы будем инкрементировать системный счетчик запусков узла (computedNode.runId), а при чтении геттеров родители будут запоминать этот runId.
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

      // Инкрементируем уникальный ID текущего расчета
      currentRunId++
      computedNode.activeRunId = currentRunId

      try {
        if (ownedEffects.size > 0) {
          for (const child of ownedEffects) {
            if (child && typeof child.dispose === 'function') {
              child.dispose()
            }
          }
          ownedEffects.clear()
        }

        // Вычисляем пользовательскую функцию.
        // В процессе выполнения геттеры сигналов запишут dep._lastSeenInRunId = currentRunId
        const newValue = fn()

        // ⚡ СВЕРХБЫСТРЫЙ МАРКЕРНЫЙ ДИФФ (Zero-Allocation Hot Path):
        // Вместо полной очистки коллекции dependencies и создания временных массивов,
        // мы в один плоский проход удаляем только те ребра, которые не были прочитаны в этом цикле!
        if (isInitialized && dependencies.size > 0) {
          // Чтобы безопасно удалять элементы Set во время итерации for...of, V8 не требует копирования,
          // если мы удаляем элементы точечно.
          for (const unknownDep of dependencies) {
            const dep = unknownDep as any
            if (dep._lastSeenInRunId !== currentRunId) {
              // Это ребро графа умерло в текущем кадре (условное ветвление)
              dependencies.delete(dep)
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
        computedNode.subscribers.add(consumer)
        consumer.dependencies.add(computedNode)

        // ⚡ Маркерная эпоха (Zero-Allocation Track)
        if (consumer.activeRunId !== undefined) {
          computedNode._lastSeenInRunId = consumer.activeRunId
        }
      }

      updateIfNecessary(computedNode)

      // Оптимизация: используем локальную ссылку consumer вместо повторного обращения к engine
      if (consumer && consumer.depVersions) {
        consumer.depVersions.set(computedInstance, version)
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
