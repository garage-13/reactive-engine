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
  }>({
    version: 0,
    unsubscribe: null,
    listeners: new Set()
  })

  const subscribeStore = (cb: () => void) => {
    storeRef.current.listeners.add(cb)

    if (!storeRef.current.unsubscribe) {
      let isInitializing = true

      const triggerUpdate = () => {
        if (isInitializing) return
        storeRef.current.version++
        storeRef.current.listeners.forEach(listener => listener())
      }

      if (isSignal) {
        storeRef.current.unsubscribe = (item as any).subscribe(triggerUpdate)
      } else if ('__subscribe' in item && typeof (item as any).__subscribe === 'function') {
        // Нативно подписываемся на сквозной эмиттер Proxy-коллекции ядра
        storeRef.current.unsubscribe = (item as any).__subscribe(triggerUpdate)
      }

      isInitializing = false
    }

    return () => {
      storeRef.current.listeners.delete(cb)
      if (storeRef.current.listeners.size === 0 && storeRef.current.unsubscribe) {
        storeRef.current.unsubscribe()
        storeRef.current.unsubscribe = null
      }
    }
  }

  // useSyncExternalStore реагирует строго на инкремент версии, перезапуская ререндер
  useSyncExternalStore(
    subscribeStore,
    () => storeRef.current.version,
    () => storeRef.current.version
  )

  const rawValue = isSignal ? (item as any).value : item

  // Возвращаем оригинальный Proxy-объект напрямую! Ссылочная идентичность инпутов в React сохраняется на 100%
  return rawValue as any
}
