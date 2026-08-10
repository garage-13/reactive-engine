import { useLayoutEffect, useRef } from 'react'
import { Signal, CleanupFn } from '../../../core'

/**
 * Универсальный хук для безопасной синхронной подписки на изменения Signal, Computed или Resource.
 * Гарантирует отсутствие упущенных тиков (Race Conditions) и мгновенную очистку в React StrictMode.
 *
 * @template T Тип данных внутри реактивного контейнера
 * @param {Pick<Signal<T>, 'subscribe'>} signal Объект подписки (Signal/Computed/Resource)
 * @param {(val: T) => void} callback Функция обратного вызова, принимающая новое значение
 * @returns {void}
 * @source
 */
export const useReactiveSubscription = <T>(
  signal: Pick<Signal<T>, 'subscribe'>,
  callback: (val: T) => void
): void => {
  // 1. Сохраняем актуальный callback в ref.
  // Мы обновляем его синхронно прямо во время рендера, уходя от лишнего useEffect
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  // 2. Используем useLayoutEffect вместо useEffect.
  // Подписка оформляется синхронно ДО того, как браузер отрисует пиксели на экране.
  // Это полностью исключает Tearing (пропуск первого асинхронного тика данных из сети/WebSocket).
  useLayoutEffect(() => {
    if (!signal || typeof signal.subscribe !== 'function') return

    // Подписываемся на изменения в ядре.
    // Наш метод frameworkPrefix автоматически подставит бэдж "react:use:..." в логи!
    const unsubscribe: CleanupFn = signal.subscribe((val) => {
      callbackRef.current(val)
    })

    // Возвращаем функцию очистки. В useLayoutEffect она срабатывает мгновенно
    // при unmount, на корню уничтожая "зомби-эффекты" в StrictMode.
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [signal])
}
