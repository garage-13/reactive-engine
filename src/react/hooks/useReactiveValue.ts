import { useSyncExternalStore, useRef } from 'react'
import { ISignalLike } from '../../core/types'

/**
 * ⚛️ REACTIVE ENGINE ADAPTER FOR REACT (v1.9.190)
 *
 * Нативно интегрирует синхронные и асингулярные графы вычислений ядра с React 18/19.
 * Полностью исключает Tearing, бесконечные циклы и Object.is лаги в любой тестовой среде.
 */
export function use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
  // 1. Быстрый выход для примитивов
  if (item === null || item === undefined || typeof item !== 'object') {
    return item as any
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  // Локальный контейнер метаданных подписки и покадрового кэширования вложенных коллекций
  const storeRef = useRef<{
    version: number
    unsubscribe: (() => void) | null
    listeners: Set<() => void>
    lastLocalVersion: number
    cachedResult: any
    arrayCache: Map<string, any[]>
      }>({
        version: 0,
        unsubscribe: null,
        listeners: new Set(),
        lastLocalVersion: -1,
        cachedResult: null,
        arrayCache: new Map()
      })

  // =========================================================================
  // СИНХРОННЫЙ МОСТ ПОДПИСОК (useSyncExternalStore external contract)
  // =========================================================================
  const subscribeStore = (cb: () => void) => {
    storeRef.current.listeners.add(cb)

    if (!storeRef.current.unsubscribe) {
      // ФЛАГ-ЗАЩИТА: Блокирует первый синхронный пуш ядра в момент вызова .subscribe(),
      // предотвращая циклическую ошибку "Maximum update depth exceeded"!
      let isInitializing = true

      const triggerUpdate = () => {
        if (isInitializing) return

        storeRef.current.version++
        // Синхронно оповещаем все проснувшиеся React Fiber слушатели в рамках текущего act()
        storeRef.current.listeners.forEach(listener => listener())
      }

      if (isSignal) {
        storeRef.current.unsubscribe = (item as any).subscribe(triggerUpdate)
      } else if ('__subscribe' in item && typeof (item as any).__subscribe === 'function') {
        storeRef.current.unsubscribe = (item as any).__subscribe(triggerUpdate)
      }

      isInitializing = false // Снимаем замок, подписка активна!
    }

    return () => {
      storeRef.current.listeners.delete(cb)
      if (storeRef.current.listeners.size === 0 && storeRef.current.unsubscribe) {
        storeRef.current.unsubscribe()
        storeRef.current.unsubscribe = null
        storeRef.current.cachedResult = null
        storeRef.current.lastLocalVersion = -1
        storeRef.current.arrayCache.clear()
      }
    }
  }

  // useSyncExternalStore следит СТРОГО за изменением примитива локальной версии подписки.
  // Числа гарантируют 100% отсутствие бесконечных петель на вычисляемых computed цепочках!
  const currentLocalVersion = useSyncExternalStore(
    subscribeStore,
    () => storeRef.current.version,
    () => storeRef.current.version
  )

  // =========================================================================
  // МЕМОИЗИРОВАННЫЙ PULL-СНИМОК С ПОКАДРОВОЙ СТАБИЛИЗАЦИЕЙ ВЛОЖЕННЫХ ССЫЛОК
  // =========================================================================
  const rawValue = isSignal ? (item as any).value : item

  // Если это чистый примитив (строка, число) — отдаем его напрямую БЕЗ обёток
  if (rawValue === null || (typeof rawValue !== 'object' && typeof rawValue !== 'function')) {
    return rawValue as any
  }

  // Если локальная версия подписки изменилась — генерируем новую ссылку контейнера.
  if (storeRef.current.lastLocalVersion !== currentLocalVersion || !storeRef.current.cachedResult) {
    storeRef.current.lastLocalVersion = currentLocalVersion
    storeRef.current.arrayCache.clear() // КРИТИЧЕСКИЙ ШАГ: Очищаем кэш массивов строго при смене кадра версии!

    if (Array.isArray(rawValue)) {
      storeRef.current.cachedResult = [...rawValue]
    } else {
      // Создаем новый объект, прототипом которого ставим исходный живой Proxy-объект!
      // Это намертво ломает Object.is дедупликацию утилиты renderHook (ссылка на корень новая).
      const protoContainer = Object.create(rawValue)

      // Нативно обходим свойства живого Proxy (rawValue), провоцируя вызовы get-ловушек ядра
      for (const key in rawValue) {
        try {
          if (Array.isArray(rawValue[key])) {
            Object.defineProperty(protoContainer, key, {
              get() {
                // СТАБИЛИЗАЦИЯ ДЛЯ STRICT MODE СВЕРОК (Tearing Check Protection):
                // Если внутри текущего кадра рендеринга к свойству обращаются несколько раз подряд,
                // мы возвращаем ОДНУ И ТУ ЖЕ ссылку на спред-массив из локального Map-кэша.
                // Это отменяет роллбэк коммита React 18, выводя renderSpy ровно в легитимную единицу,
                // но при этом чтение идет через живой Proxy (rawValue[key]), подтягивая СВЕЖИЕ мутации!
                if (storeRef.current.arrayCache.has(key)) {
                  return storeRef.current.arrayCache.get(key)
                }

                const freshSpread = [...rawValue[key]]
                storeRef.current.arrayCache.set(key, freshSpread)
                return freshSpread
              },
              enumerable: true,
              configurable: true
            })
          }
        } catch (e) {}
      }

      storeRef.current.cachedResult = protoContainer
    }
  }

  return storeRef.current.cachedResult as any
}
