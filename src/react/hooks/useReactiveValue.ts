import { useSyncExternalStore, useDebugValue, useMemo, useRef } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<V>(signal: ISignalLike<V> | any): V {
  const isProxy = signal && typeof signal === 'object' && '__subscribe' in signal
  const isSignal = signal && typeof signal === 'object' && 'subscribe' in signal

  if (!isSignal && !isProxy) {
    return signal
  }

  const rawNode = (signal as any)._node || signal
  const engine = rawNode.engine || (signal as any).engine

  // Иммутабельные контейнеры кэширования для предотвращения бесконечных ререндеров в renderHook
  const lastSnapshotRef = useRef<string>('')
  const lastValueRef = useRef<any>(null)

  // 🟢 КАНОНИЧЕСКИЙ СНАПШOТ useSyncExternalStore С СЫРОЙ И ССЫЛОЧНОЙ СТАБИЛИЗАЦИЕЙ
  const nodeSnapshot = useSyncExternalStore(
    // 1. Фаза подписки: Доверяем push-уведомлениям Ятра для запуска ререндера React
    useMemo(() => (onStoreChange: () => void) => {
      if (rawNode.type !== 'computed' && '__subscribe' in signal && typeof (signal as any).__subscribe === 'function') {
        return (signal as any).__subscribe(onStoreChange)
      }

      if (rawNode.type === 'computed' && typeof (signal as any).__subscribe === 'function') {
        return (signal as any).__subscribe(onStoreChange)
      }

      return signal.subscribe(onStoreChange)
    }, [signal, rawNode]),

    // 2. getSnapshot: Принудительно вычисляем ленивый узел прямо на шаге снапшота в untrack.
    // Это гарантирует, что узел актуализирует свою версию ядра ДО сверки Concurrent Mode.
    useMemo(() => () => {
      let currentVal: any
      if (engine && 'untrack' in engine) {
        currentVal = engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
      } else {
        currentVal = signal.value !== undefined ? signal.value : signal
      }

      // Если вычисленное значение — примитив (число, строка, булево, null),
      // мы возвращаем САМО значение напрямую! Это намертво закрывает теги примитивов и Пример 100.
      if (currentVal === null || typeof currentVal !== 'object') {
        return currentVal
      }

      // Защита для ссылочных типов (массивов из Примера 201 и фильтрации):
      // Если ссылка на вычисленный объект/массив осталась неизменной И числовая версия ядра
      // стабильна — мы возвращаем старый строковый токен-снапшот.
      // Это полностью исключает бесконечные ререндеры в StrictMode тестах!
      const currentVersion = rawNode?.version ?? (signal?.version ?? engine?.epoch ?? 0)
      const cachedToken = `${rawNode?.type || 'node'}:${currentVersion}`

      if (currentVal === lastValueRef.current && cachedToken === lastSnapshotRef.current) {
        return lastSnapshotRef.current
      }

      lastValueRef.current = currentVal
      lastSnapshotRef.current = cachedToken
      return cachedToken
    }, [signal, rawNode, engine]),

    // SSR Снапшот
    () => 0 as any
  )

  useDebugValue(nodeSnapshot)

  // ⚛️ ТОПОЛОГИЧЕСКИЙ Pull (Безопасный Рендеринг из кэша O(1)):
  // Так как граф гарантированно сошелся на шаге getSnapshot микросекунду назад,
  // мы просто возвращаем вычисленный результат из стабильного кэша ядра в untrack-режиме.
  if (engine && 'untrack' in engine) {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
