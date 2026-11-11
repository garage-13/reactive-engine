import { useSyncExternalStore, useDebugValue, useMemo, useRef } from 'react'
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
  const engine = rawNode.engine || signal._engine || signal.engine

  // Синхронный монотонный счётчик версий для getSnapshot() в useSyncExternalStore
  const versionRef = useRef(0)

  const subscribe = useMemo(() => (onStoreChange: () => void) => {
    let isInitialRun = true

    const triggerStoreRerender = () => {
      // Игнорируем синхронный стартовый вызов при подписке, чтобы не вызывать лишний ререндер при маунте
      if (isInitialRun) {
        isInitialRun = false
        return
      }
      versionRef.current += 1
      onStoreChange()
    }

    // 1. Для computed и обычных signal всегда используем активный .subscribe(),
    // который гарантированно пересчитывает ленивый узел при мутации корня
    if (isSignal && typeof signal.subscribe === 'function') {
      const unsub = signal.subscribe(triggerStoreRerender)
      isInitialRun = false
      return unsub
    }

    // 2. Пассивный __subscribe оставляем только для глубоких Proxy-объектов (где нет .subscribe)
    if (isProxy && typeof signal.__subscribe === 'function') {
      const unsub = signal.__subscribe(triggerStoreRerender)
      isInitialRun = false
      return unsub
    }

    return () => {}
  }, [signal, isSignal, isProxy])

  const version = useSyncExternalStore(
    subscribe,
    () => versionRef.current,
    () => 0
  )

  useDebugValue(version)

  // ⚛️ ТОПОЛОГИЧЕСКИЙ Pull: Стягиваем свежее значение в теле рендера под untrack
  if (engine && typeof engine.untrack === 'function') {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
