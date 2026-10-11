import { useSyncExternalStore, useRef } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<T>(item: T): T extends ISignalLike<infer V> ? V : T {
  if (item === null || item === undefined || typeof item !== 'object') {
    return item as any
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  const storeRef = useRef<{
    version: number
    unsubscribe: (() => void) | null
    listeners: Set<() => void>
    lastLocalVersion: number
    cachedResult: any
    subCleanups: Set<() => void>
    isPendingUpdate: boolean
  }>({
    version: 0,
    unsubscribe: null,
    listeners: new Set(),
    lastLocalVersion: -1,
    cachedResult: null,
    subCleanups: new Set(),
    isPendingUpdate: false
  })

  const subscribeStore = (cb: () => void) => {
    storeRef.current.listeners.add(cb)

    if (!storeRef.current.unsubscribe) {
      let isInitializing = true

      const triggerUpdate = () => {
        if (isInitializing) return
        
        // Синхронно накапливаем инкремент версий, гарантируя, что useSyncExternalStore
        // зафиксирует изменения, но блокируем повторные вызовы listeners до выхода из батча
        if (storeRef.current.isPendingUpdate) {
          storeRef.current.version++
          return
        }
        
        storeRef.current.isPendingUpdate = true
        storeRef.current.version++
        storeRef.current.listeners.forEach(listener => listener())
        
        // Сбрасываем защёлку строго на следующем микрошаге Event Loop
        Promise.resolve().then(() => {
          storeRef.current.isPendingUpdate = false
        })
      }

      if (isSignal) {
        storeRef.current.unsubscribe = (item as any).subscribe(triggerUpdate)
      } else {
        const setupDeepSubscriptions = (obj: any) => {
          if (obj === null || typeof obj !== 'object') return
          
          if ('__subscribe' in obj && typeof obj.__subscribe === 'function') {
            const mainUnsub = obj.__subscribe(triggerUpdate)
            storeRef.current.subCleanups.add(mainUnsub)
          }
          
          for (const key in obj) {
            try {
              const val = obj[key]
              if (val !== null && typeof val === 'object') {
                if ('__subscribe' in val && typeof (val as any).__subscribe === 'function') {
                  const subUnsub = (val as any).__subscribe(triggerUpdate)
                  storeRef.current.subCleanups.add(subUnsub)
                }
                const rawArray = obj[key]
                if (Array.isArray(rawArray) && '__subscribe' in rawArray) {
                  const arrayUnsub = (rawArray as any).__subscribe(triggerUpdate)
                  storeRef.current.subCleanups.add(arrayUnsub)
                }
              }
            } catch (e) {}
          }
        }

        setupDeepSubscriptions(item)

        storeRef.current.unsubscribe = () => {
          storeRef.current.subCleanups.forEach(unsub => unsub())
          storeRef.current.subCleanups.clear()
        }
      }

      isInitializing = false
    }

    return () => {
      storeRef.current.listeners.delete(cb)
      if (storeRef.current.listeners.size === 0 && storeRef.current.unsubscribe) {
        storeRef.current.unsubscribe()
        storeRef.current.unsubscribe = null
        storeRef.current.cachedResult = null
        storeRef.current.lastLocalVersion = -1
      }
    }
  }

  const currentLocalVersion = useSyncExternalStore(
    subscribeStore,
    () => storeRef.current.version,
    () => storeRef.current.version
  )

  const rawValue = isSignal ? (item as any).value : item

  if (rawValue === null || (typeof rawValue !== 'object' && typeof rawValue !== 'function')) {
    return rawValue as any
  }

  if (storeRef.current.lastLocalVersion !== currentLocalVersion || !storeRef.current.cachedResult) {
    storeRef.current.lastLocalVersion = currentLocalVersion

    if (Array.isArray(rawValue)) {
      storeRef.current.cachedResult = [...rawValue]
    } else {
      // Создаем динамический прокси-снимок кадра.
      // Геттеры прокси всегда будут читать СВЕЖИЕ данные из rawValue в реальном времени,
      // полностью аннулируя внутреннее кэширование свойств утилиты renderHook!
      storeRef.current.cachedResult = new Proxy(rawValue, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          if (Array.isArray(value)) {
            return [...value]
          }
          return value
        },
        ownKeys(target) {
          return Reflect.ownKeys(target)
        },
        getOwnPropertyDescriptor(target, prop) {
          return {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (target as any)[prop]
          }
        }
      })
    }
  }

  return storeRef.current.cachedResult as any
}
