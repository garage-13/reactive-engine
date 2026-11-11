import { useSyncExternalStore, useDebugValue, useMemo, useRef } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<V>(signal: ISignalLike<V>): V;
export function useReactiveValue<T extends object>(proxy: T): T;
export function useReactiveValue<T>(primitive: T): T;
export function useReactiveValue(signal: any): any {
  const isProxy = Boolean(signal && typeof signal === 'object' && '__subscribe' in signal)
  const isSignal = Boolean(signal && typeof signal === 'object' && 'subscribe' in signal)

  const rawNode = (isSignal || isProxy) ? (signal._node || signal) : null
  const engine = rawNode ? (rawNode.engine || signal._engine || signal.engine) : null

  const versionRef = useRef(0)

  const subscribe = useMemo(() => (onStoreChange: () => void) => {
    if (!isSignal && !isProxy) {
      return () => {}
    }

    let isInitialRun = true

    const triggerStoreRerender = () => {
      if (isInitialRun) {
        isInitialRun = false
        return
      }
      versionRef.current += 1
      onStoreChange()
    }

    if (isSignal && typeof signal.subscribe === 'function') {
      const unsub = signal.subscribe(triggerStoreRerender)
      isInitialRun = false
      return unsub
    }

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

  if (!isSignal && !isProxy) {
    return signal
  }

  if (engine && typeof engine.untrack === 'function') {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
