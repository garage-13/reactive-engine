import { useSyncExternalStore, useCallback, useMemo, useEffect } from 'react'
import { CleanupFn } from '../../core'

interface ObservableItem<T> {
  readonly value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn
  destroy?: () => void
}

type ReactiveInput<T> = ObservableItem<T> | (() => ObservableItem<T>)

/**
 * Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента.
 * Поддерживает React 18+ и ленивые фабрики без утечек памяти.
 *
 * @source
 */
export const useReactiveValue = <T>(input: ReactiveInput<T>): T => {
  // 1. Всегда получаем чистый объект, даже если передали функцию-фабрику () => engine.computed(...)
  const reactiveItem = useMemo(() => {
    return typeof input === 'function' ? input() : input
  }, [input])

  // 2. Стабилизируем функции для useSyncExternalStore
  const subscribe = useCallback(
    (reactCallback: () => void) => {
      return reactiveItem.subscribe(reactCallback)
    },
    [reactiveItem]
  )

  const getSnapshot = useCallback(() => {
    return reactiveItem.value
  }, [reactiveItem])

  // 3. Автоматически подчищаем динамические вычисления при размонтировании
  useEffect(() => {
    return () => {
      if (reactiveItem && typeof reactiveItem.destroy === 'function') {
        reactiveItem.destroy()
      }
    }
  }, [reactiveItem])

  return useSyncExternalStore(subscribe, getSnapshot)
}
