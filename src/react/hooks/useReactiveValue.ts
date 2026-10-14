import { useSyncExternalStore, useDebugValue, useMemo, useRef, useState } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<V>(signal: ISignalLike<V> | any): V {
  const isProxy = signal && typeof signal === 'object' && '__subscribe' in signal
  const isSignal = signal && typeof signal === 'object' && 'subscribe' in signal

  if (!isSignal && !isProxy) {
    return signal
  }

  const rawNode = (signal as any)._node || signal
  const engine = rawNode.engine || (signal as any).engine

  // Локальный тикет рендеринга для useSyncExternalStore.
  // Это ЕДИНСТВЕННЫЙ детерминированный источник истины для React Concurrent Mode.
  const [ticket, setTicket] = useState(0)

  // 🟢 КАНОНИЧЕСКИЙ ВЕРСИОННЫЙ СНАПШOТ useSyncExternalStore С СИНХРOННЫМ ПOДТЯГИВАНИЕМ КЭША
  useSyncExternalStore(
    // 1. Фаза подписки: Доверяем push-уведомлениям Ядра для запуска ререндера React
    useMemo(() => (onStoreChange: () => void) => {
      const triggerStoreRerender = () => {
        setTicket((t) => t + 1)
        onStoreChange()
      }

      // Для вычисляемых свойств используем скрытый __subscribe, который ловит markDirty(1)
      if (rawNode.type === 'computed' && typeof (signal as any).__subscribe === 'function') {
        return (signal as any).__subscribe(triggerStoreRerender)
      }

      if (rawNode.type !== 'computed' && '__subscribe' in signal && typeof (signal as any).__subscribe === 'function') {
        return (signal as any).__subscribe(triggerStoreRerender)
      }

      return signal.subscribe(triggerStoreRerender)
    }, [signal, rawNode]),

    // 2. getSnapshot: Чистая, snapshot-безопасная O(1) операция!
    // Мы СТРОГО возвращаем локальный ticket, изолируя React от бесконечного инкремента engine.epoch.
    // Это намертво защищает от краша "Maximum update depth exceeded"!
    () => ticket,

    // SSR Снапшот
    () => 0
  )

  useDebugValue(ticket)

  // ⚛️ ТОПОЛОГИЧЕСКИЙ Pull (Безопасный Рендеринг из O(1) кэша ядра):
  // Вычисляем граф и стягиваем свежее значение непосредственно в теле рендера.
  // Оборачиваем в untrack, чтобы сам рендеринг React не создавал паразитных связей.
  if (engine && 'untrack' in engine) {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
