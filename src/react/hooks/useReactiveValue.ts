import { useSyncExternalStore, useDebugValue, useMemo, useState } from 'react'
import { ISignalLike } from '../../core/types'

/**
 * ⚛️ УЛЬТИМАТИВНЫЙ ХУК ДЛЯ СТЯГИВАНИЯ ДАННЫХ ИЗ ГРАФА В СРЕДУ REACT
 * Автоматически выводит тип внутренней структуры данных (V) из любого сигнала или вычисляемого свойства.
 */
export function useReactiveValue<V>(signal: ISignalLike<V>): V;
export function useReactiveValue<T extends object>(proxy: T): T;
export function useReactiveValue<T>(primitive: T): T;
export function useReactiveValue(signal: any): any {
  const isProxy = signal && typeof signal === 'object' && '__subscribe' in signal
  const isSignal = signal && typeof signal === 'object' && 'subscribe' in signal

  if (!isSignal && !isProxy) {
    return signal
  }

  const rawNode = signal._node || signal
  const engine = rawNode.engine || signal.engine

  // Локальный тикет рендеринга для useSyncExternalStore.
  const [ticket, setTicket] = useState(0)

  // 🟢 КАНОНИЧЕСКИЙ ВЕРСИОННЫЙ СНАПШOТ useSyncExternalStore С СИНХРOННЫМ ПOДТЯГИВАНИЕМ КЭША
  useSyncExternalStore(
    useMemo(() => (onStoreChange: () => void) => {
      const triggerStoreRerender = () => {
        setTicket((t) => t + 1)
        onStoreChange()
      }

      if (rawNode.type === 'computed' && typeof signal.__subscribe === 'function') {
        return signal.__subscribe(triggerStoreRerender)
      }

      if (rawNode.type !== 'computed' && '__subscribe' in signal && typeof signal.__subscribe === 'function') {
        return signal.__subscribe(triggerStoreRerender)
      }

      return signal.subscribe(triggerStoreRerender)
    }, [signal, rawNode]),

    () => ticket,
    () => 0
  )

  useDebugValue(ticket)

  // ⚛️ ТОПОЛОГИЧЕСКИЙ Pull: Стягиваем свежее значение в теле рендера под untrack
  if (engine && 'untrack' in engine) {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
