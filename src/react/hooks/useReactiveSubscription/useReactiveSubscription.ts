import { useEffect, useRef } from 'react'
import { ISignalLike } from '../types'

type CleanupFn = () => void

/**
 * Универсальный хук подписки на реактивные источники ядра для React.
 * Полиморфно поддерживает как примитивные Сигналы/Computed, так и Proxy-объекты reactive().
 */
export function useReactiveSubscription<T>(
  item: T,
  callback: (val: T extends ISignalLike<infer V> ? V : T) => void
): void {
  // Сохраняем ссылку на актуальный колбэк, чтобы защитить от лишних переподписок
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!item || typeof item !== 'object') return

    // 1. Сценарий А: У объекта есть нативный метод подписки .subscribe (Сигнал / Computed)
    if ('subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function') {
      const signalItem = (item as unknown) as ISignalLike<unknown>

      const unsubscribe = signalItem.subscribe((newValue) => {
        callbackRef.current(newValue as any)
      })

      return () => unsubscribe()
    }

    // 2. Сценарий Б: Передан Proxy-объект (используем служебный геттер фреймворк-адаптеров)
    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      const unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        // При мутации свойств или массивов Proxy пинаем колбэк с актуальным состоянием объекта
        callbackRef.current(item as any)
      })

      return () => unsubscribe()
    }
  }, [item])
}
