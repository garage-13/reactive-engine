import { useEffect, useLayoutEffect, useRef } from 'react'
import { ISignalLike } from '../../core/types'

type CleanupFn = () => void

/**
 * 🔄 Универсальный хук подписки без принудительного рендеринга самого компонента.
 * Идеален для вызова аналитики, сайд-эффектов или логов при изменении коллекций.
 */
export function useReactiveSubscription<T>(
  item: T,
  callback: (val: T extends ISignalLike<infer V> ? V : T) => void
): void {
  const callbackRef = useRef(callback)

  useLayoutEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!item || typeof item !== 'object') return

    if ('subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function') {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      return signalItem.subscribe((newValue) => {
        callbackRef.current(newValue as never)
      })
    }

    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      return ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        callbackRef.current(item as never)
      })
    }
  }, [item])
}
