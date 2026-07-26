import { useEffect, useRef } from 'react'
import { Signal, CleanupFn } from '../../core'

/**
 * Универсальный хук для подписки на изменения Signal, Computed или Resource.
 * @template T Тип данных внутри реактивного контейнера
 * @param {Signal<T> | { subscribe: (cb: (val: T) => void) => CleanupFn }} signal Объект подписки
 * @param {(val: T) => void} callback Функция обратного вызова, принимающая новое значение
 * @source
 */
export const useReactiveSubscription = <T>(
  signal: Pick<Signal<T>, 'subscribe'>,
  callback: (val: T) => void
): void => {
  // Сохраняем актуальный callback в ref, чтобы не перезапускать эффект при его изменении
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    // Подписываемся один раз при изменении самого signal
    const unsubscribe: CleanupFn = signal.subscribe((val) => {
      callbackRef.current(val)
    })

    // Возвращаем функцию очистки для автоматической отписки при размонтировании
    return unsubscribe
  }, [signal])
}
