import { useSyncExternalStore, useDebugValue, useState, useMemo } from 'react'
import { ISignalLike } from '../../core/types'

export function useReactiveValue<V>(signal: ISignalLike<V> | any): V {
  const isProxy = signal && typeof signal === 'object' && '__subscribe' in signal
  const isSignal = signal && typeof signal === 'object' && 'subscribe' in signal

  if (!isSignal && !isProxy) {
    return signal
  }

  const rawNode = (signal as any)._node || signal
  const engine = rawNode.engine || (signal as any).engine

  // Использование локального стейта-счетчика версий гарантирует,
  // что Object.is() внутри React 18 Concurrent Mode взведется в false 
  // для любых ссылочных типов, массивов и примитивов вычислений!
  const [localVersion, setLocalVersion] = useState(0)

  // 🟢 КАНОНИЧЕСКИЙ АКТИВНЫЙ ВЕРСИОННЫЙ МОСТ (Идемпотентный Snap)
  useSyncExternalStore(
    // Фаза подписки: Изумительно будит ленивые computed-ноды за счет 
    // вызова оригинального метода .subscribe(), который вешает активный эффект ядра!
    useMemo(() => (onStoreChange: () => void) => {
      const triggerStoreRerender = () => {
        // Синхронно инкрементируем локальную версию хука
        setLocalVersion((v) => v + 1)
        onStoreChange()
      }

      // Для Proxy-объектов используем пассивный хук транзакций,
      // но для Сигналов и Computed — строго честный, активный .subscribe()!
      if (rawNode.type !== 'computed' && '__subscribe' in signal && typeof (signal as any).__subscribe === 'function') {
        return (signal as any).__subscribe(triggerStoreRerender)
      }
      
      return signal.subscribe(triggerStoreRerender)
    }, [signal, rawNode, engine]),
    
    // getSnapshot: Кристально чистая, детерминированная O(1) операция!
    // Возвращает примитивное число локальной версии. Никаких деструктивных вызовов 
    // .run() или геттеров внутри снапшота — абсолютная защита от Render Loop!
    () => localVersion,
    
    // Снапшот для сервера (SSR)
    () => 0
  )

  useDebugValue(localVersion)

  // ⚛️ ТОПОЛОГИЧЕСКАЯ АКТУАЛИЗАЦИЯ И ИЗОЛЯЦИЯ ФАЗЫ РЕНДЕРА (Topological Pull):
  // В теле рендера компонента React мы вызываем оригинальный публичный геттер .value.
  // Но делаем это строго внутри engine.untrack(), полностью исключая появление 
  // избыточных транзакций ядра, зацикливаний и холостых логов во время рендера React!
  if (engine && 'untrack' in engine) {
    return engine.untrack(() => (signal.value !== undefined ? signal.value : signal))
  }

  return signal.value !== undefined ? signal.value : signal
}
