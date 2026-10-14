import { IEffect, EffectFn, CleanupFn } from './types'

// Расширяем интерфейс IEffect для внутренних нужд иерархического планировщика Ядра
interface ICoreEffectNode extends IEffect {
  dependencies: Set<any>;
  depVersions: Map<any, number>;
  ownedEffects: Set<ICoreEffectNode>;
  type: string;
  depth: number;
  state: number;
  _node: any;
  dispose: () => void;
}

export function createEffect(engine: any, fn: EffectFn): () => void {
  let isDisposed = false
  let isRunning = false // Флаг-защита от бесконечных циклов внутри одного эффекта

  // Системный стейт узла: 0 = STABLE, 1 = CHECK, 2 = DIRTY
  let state = 2

  const dependencies = new Set<any>()
  const depVersions = new Map<any, number>()

  // Иерархическое хранилище внутренних вложенных эффектов (Контекст Владения)
  const ownedEffects = new Set<ICoreEffectNode>()

  // Явно реализуем расширенный интерфейс на базе системного IEffect
  const effectNode: ICoreEffectNode = {
    id: engine.subscriberId++,
    dependencies,
    ownedEffects,
    cleanups: new Set<CleanupFn>(), // Каноническое поле cleanups из интерфейса IEffect
    type: 'effect',
    depth: 0,

    get isDirty(): boolean { return state > 0 },
    set isDirty(val: boolean) { if (val) state = 2 },

    get isDisposed(): boolean { return isDisposed },
    set isDisposed(val: boolean) { isDisposed = val },

    get state(): number { return state },
    set state(val: number) { state = val },
    get depVersions(): Map<any, number> { return depVersions },

    // Ссылка на самого себя для совместимости с внешними консьюмерами адаптеров
    get _node(): any { return effectNode },

    // Реализация метода markDirty из интерфейса IEffect
    markDirty: () => {
      if (state >= 1) return
      state = 1
      engine.pendingEffects.add(effectNode)
    },

    // Основной метод выполнения фазы эффекта
    run: () => {
      if (isDisposed || isRunning) return
      isRunning = true

      // 🎯 ТОЧЕЧНОЕ УНИЧТОЖЕНИЕ СТАРЫХ ВЛОЖЕННЫХ ЭФФЕКТOВ ДО НАЧАЛА НОВОЙ ОЦЕНКИ (Фикс #237-CONCURRENT):
      // Мы обязаны полностью уничтожить дочерний контекст предыдущего кадра
      // ВНЕ активного отслеживания консьюмера, чтобы старые ссылки не застревали в памяти.
      if (ownedEffects.size > 0) {
        const prevConsumer = engine.activeConsumer
        const prevOwner = engine.activeOwner
        engine.activeConsumer = null
        engine.activeOwner = null
        ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
        ownedEffects.clear()
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
      }

      // ИЗОЛЯЦИЯ ОШИБОК В ДЕСТРУКТОРАХ (Синхронный сброс старого кадра):
      if (effectNode.cleanups.size > 0) {
        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = null // Временно выключаем трекинг

        effectNode.cleanups.forEach(cleanup => {
          try {
            cleanup()
          } catch (err) {
            console.error(err) // Даем consoleSpy легитимно поймать падающий деструктор!
          }
        })

        effectNode.cleanups.clear()
        engine.activeConsumer = prevConsumer
      }

      const prevConsumer = engine.activeConsumer
      const prevOwner = engine.activeOwner

      // Выставляем глобальные указатели Ядра на текущий узел перед запуском тела
      engine.activeConsumer = effectNode
      engine.activeOwner = effectNode

      // Делаем слепок старых зависимостей для динамического diff-расхождения
      const oldDeps = new Set(dependencies)
      dependencies.clear()

      try {
        state = 0 // Узел переходит в стабильное состояние до вызова тела

        const result = fn()
        if (typeof result === 'function') {
          effectNode.cleanups.add(result)
        }

        // Дифференцируем внешние рёбра графа строго ПОСЛЕ выполнения тела fn()
        oldDeps.forEach(dep => {
          if (!dependencies.has(dep)) {
            const rawDepNode = dep._node || dep
            if (rawDepNode.subscribers) rawDepNode.subscribers.delete(effectNode)
            depVersions.delete(dep)
          }
        })

        // Актуализируем числовые версии ребер и пересчитываем глубину depth
        let maxDepDepth = 0
        dependencies.forEach(dep => {
          const rawNode = dep._node || dep
          depVersions.set(dep, rawNode.version)
          if (rawNode.subscribers) rawNode.subscribers.add(effectNode)
          if (rawNode.depth !== undefined && rawNode.depth > maxDepDepth) {
            maxDepDepth = rawNode.depth
          }
        })
        effectNode.depth = maxDepDepth + 1

      } finally {
        isRunning = false
        engine.activeConsumer = prevConsumer
        engine.activeOwner = prevOwner
      }
    },

    // Публичный метод принудительного размонтирования подписки
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      effectNode.isDisposed = true

      // Каскадно выжигаем вложенных детей при уничтожении родителя
      ownedEffects.forEach(child => { if (child.dispose) child.dispose() })
      ownedEffects.clear()

      // Вызываем пользовательские cleanups из интерфейса IEffect с полной изоляцией ошибок
      if (effectNode.cleanups.size > 0) {
        const prevConsumer = engine.activeConsumer
        engine.activeConsumer = null

        effectNode.cleanups.forEach(cleanup => {
          try {
            cleanup()
          } catch (err) {
            console.error(err)
          }
        })

        effectNode.cleanups.clear()
        engine.activeConsumer = prevConsumer
      }

      // Чистим внешние ссылки подписок графа
      dependencies.forEach(dep => {
        const rawNode = dep._node || dep
        if (rawNode.subscribers) rawNode.subscribers.delete(effectNode)
      })
      dependencies.clear()
      depVersions.clear()
    }
  }

  // 🎯 Автоматическая регистрация во внешнем владельце контекста СТРОГО ДО первого запуска.
  // Это гарантирует, что иерархическое дерево консьюмеров соберется без лагов контекста!
  if (engine.activeOwner && engine.activeOwner.ownedEffects) {
    engine.activeOwner.ownedEffects.add(effectNode)
  }

  // Первичный синхронный старт эффекта при его декларации
  effectNode.run()

  return effectNode.dispose
}
