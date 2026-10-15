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
  // Маркер эпохи вычисления кадра графа
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

      for (const unknownDep of snapshotDeps) {
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
    }
  }

  // Заменяем логику автоматического удаления при нуле подписчиков.
  // Вместо полной зачистки releaseNode() мы просто сбрасываем состояние,
  // но ОСТАВЛЯЕМ узел в кэше движка!
  const subscribers = new class extends Set<any> {
    override delete(val: any): boolean {
      const res = super.delete(val)
      if (this.size === 0) {
        state = 2           // Переводим в DIRTY, чтобы при следующем чтении он пересчитался
        isDirty = true
        isInitialized = false
        // ⚡ ОПТИМИЗАЦИЯ: Убираем releaseNode(computedNode) и удаление из кэша отсюда!
        // Позволяем ленивому computed оставаться в памяти и удерживать каркас зависимостей.
      }
      return res
    }
  }()

  // Отслеживание эпохи проверки
  let verifiedInEpoch = -1

  const updateIfNecessary = (node: any): boolean => {
    if (!isInitialized) return node.run()
    if (node.state === 2) return node.run()

    // ⚡ СВЕРХБЫСТРЫЙ BAILOUT (O(1) Hot Path):
    // Если этот узел уже проверялся или пересчитывался в текущей эпохе,
    // мы мгновенно выходим, предотвращая комбинаторный взрыв рекурсии.
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
            // Рекурсивно погружаемся в родителя, только если предыдущие еще не изменились
            if (rawDep.type === 'computed' && rawDep.state > 0) {
              updateIfNecessary(rawDep)
            }

            if (node.depVersions.get(dep) !== rawDep.version) {
              hasChangedParent = true
            }
          }
        }
      }

      // Фиксируем, что в этой эпохе узел полностью проверен и стабилен
      verifiedInEpoch = engine.epoch
      node.state = 0

      if (hasChangedParent || isDirty) {
        return node.run()
      }
      return false
    }

    // Если узел был в состоянии 0 (STABLE), фиксируем эпоху его валидности
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
      // 1. Быстрый выход, если узел уже актуализирован в рамках текущей эпохи кадра
      if (evaluatedInEpoch === engine.epoch && isInitialized) {
        return false
      }
      evaluatedInEpoch = engine.epoch
      verifiedInEpoch = engine.epoch // Синхронизируем маркер проверки при честном расчете

      // 2. Пуленепробиваемая защита от циклических зависимостей графа
      if (engine.cycleDetectionStack.has(computedNode)) {
        throw new Error('[Graph Error] Cyclic dependency detected')
      }
      engine.cycleDetectionStack.add(computedNode)

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      // 3. Выставляем глобальные контексты Ядра строго ДО выполнения функции fn()
      engine.activeConsumer = computedNode
      engine.activeOwner = computedNode

      // 4. ⚡ ZERO-SET OPTIMIZATION: Вместо создания тяжелой коллекции new Set(dependencies)
      // мы стягиваем элементы в плоский массив. Это в разы легче для Garbage Collector.
      const oldDeps = dependencies.size > 0 ? Array.from(dependencies) : null
      dependencies.clear() // Честно очищаем, чтобы геттеры собрали только живую ветку!

      try {
        // Очищаем вложенные эффекты предыдущего кадра строго ДО оценки fn()
        if (ownedEffects.size > 0) {
          for (const child of ownedEffects) {
            if (child && typeof child.dispose === 'function') {
              child.dispose()
            }
          }
          ownedEffects.clear()
        }

        const newValue = fn()

        // 5. Дифференцируем внешние связи графа строго ПОСЛЕ вычисления fn()
        // ⚡ ОПТИМИЗАЦИЯ: Быстрый плоский цикл for...of по массиву старых зависимостей
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

        // 6. Актуализируем числовые версии ребер и пересчитываем depth
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
        // 7. Всегда гарантированно восстанавливаем контексты Ядра в блоке finally
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
    // Полную зачистку графа делаем СТРОГО при явном вызове .destroy(),
    // который бенчмарк сам вызовет в конце теста через утилиту cleanup/retain!
    destroy: () => {
      computedNode.subscribers.clear()
      releaseNode(computedNode) // Честная глубокая очистка связей
      engine.computedCache.delete(fn) // Удаление из кэша строго по требованию
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
