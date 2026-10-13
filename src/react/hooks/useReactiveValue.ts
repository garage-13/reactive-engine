import { useState, useEffect, useDebugValue } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<V>(signal: ISignalLike<V> | any): V {
  const isProxy = signal && typeof signal === 'object' && '__subscribe' in signal
  const isSignal = signal && typeof signal === 'object' && 'subscribe' in signal

  if (!isSignal && !isProxy) {
    return signal
  }

  // Находим корневой инстанс ядра реактивности фреймворка
  const rawNode = (signal as any)._node || signal
  const engine = rawNode.engine || (signal as any).engine

  // РЕАКТИВНЫЙ БУФЕР ДЛЯ REACT 18 CONCURRENT MODE
  // Инициализируем локальный стейт React строго актуальным значением из кэша.
  // Использование engine.untrack() защищает стартовый рендер в StrictMode от утечки контекста!
  const [localState, setLocalState] = useState(() => {
    if (engine && 'untrack' in engine) {
      return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
    }
    return signal.value !== undefined ? signal.value : signal
  })

  useEffect(() => {
    // Выбираем пассивный системный хук __subscribe для computed и proxy,
    // чтобы просыпаться строго один раз в конце транзакции, убирая дубли из консоли
    const hasHook = '__subscribe' in signal && typeof (signal as any).__subscribe === 'function'

    const triggerStoreUpdate = () => {
      // Актуализируем ленивое значение кэша строго на этапе закрытия транзакции ядра
      const freshValue = signal.value !== undefined ? signal.value : signal

      // Проталкиваем изменения в локальный стейт React.
      // Если это массив, React зафиксирует новую ссылку и сделает ровно 1 ререндер!
      setLocalState(freshValue)
    }

    const unsubscribe = hasHook
      ? (signal as any).__subscribe(triggerStoreUpdate)
      : signal.subscribe((newValue: any) => setLocalState(newValue))

    return () => unsubscribe()
  }, [signal])

  useDebugValue(localState)

  // Возвращаем локальный изолированный стейт. Во время фазы рендера React
  // хук больше не дергает внутренние геттеры ядра, полностью блокируя Render Loop
  // и гарантируя 100% стабильность ссылочных типов данных в renderHook!
  return localState
}
