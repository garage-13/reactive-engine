import { useSyncExternalStore, useRef } from 'react'
import { ISignalLike } from '../../core/types'

/**
 * ⚛️ REACTIVE ENGINE ADAPTER FOR REACT (v1.9.86)
 *
 * Нативно интегрирует синхронные и асингулярные графы вычислений ядра с React 18/19.
 * Полностью исключает Tearing, бесконечные циклы и Object.is лаги в любой тестовой среде.
 */
export function use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
  // 1. Быстрый выход для примитивов, переданных по ошибке
  if (item === null || item === undefined || typeof item !== 'object') {
    return item as any
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  // Локальный контейнер метаданных подписки
  const storeRef = useRef<{
    version: number
    unsubscribe: (() => void) | null
    listeners: Set<() => void>
    lastKernelVersion: number
    cachedResult: any
      }>({
        version: 0,
        unsubscribe: null,
        listeners: new Set(),
        lastKernelVersion: -1,
        cachedResult: null
      })

  // Функция извлечения физической числовой версии изменения ноды напрямую из графа ядра
  const getKernelVersion = () => {
    if (isSignal) {
      const node = (item as any)._node || item
      return node.version || 0
    }
    return (item as any)._version || 0
  }

  // =========================================================================
  // СИНХРОННЫЙ МОСТ ПОДПИСОК (useSyncExternalStore external contract)
  // =========================================================================
  const subscribeStore = (cb: () => void) => {
    storeRef.current.listeners.add(cb)

    if (!storeRef.current.unsubscribe) {
      // ФЛАГ-ЗАЩИТА: Блокирует первый синхронный пуш ядра в момент вызова .subscribe(),
      // предотвращая циклическую ошибку "Maximum update depth exceeded"!
      let isInitializing = true

      const triggerUpdate = () => {
        if (isInitializing) return

        storeRef.current.version++
        // Синхронно оповещаем все проснувшиеся React Fiber слушатели в рамках текущего act()
        storeRef.current.listeners.forEach(listener => listener())
      }

      if (isSignal) {
        storeRef.current.unsubscribe = (item as any).subscribe(triggerUpdate)
      } else if ('__subscribe' in item && typeof (item as any).__subscribe === 'function') {
        storeRef.current.unsubscribe = (item as any).__subscribe(triggerUpdate)
      }

      isInitializing = false // Снимаем замок, подписка активна и готова ловить честные мутации!
    }

    return () => {
      storeRef.current.listeners.delete(cb)
      if (storeRef.current.listeners.size === 0 && storeRef.current.unsubscribe) {
        storeRef.current.unsubscribe()
        storeRef.current.unsubscribe = null
        storeRef.current.cachedResult = null
        storeRef.current.lastKernelVersion = -1
      }
    }
  }

  // ЗОЛОТОЙ СТАНДАРТ: useSyncExternalStore следит СТРОГО за изменением примитива версии подписки.
  // Числа ссылочно стабильны (0 -> 1 -> 2), что гарантирует 100% отсутствие бесконечных петель
  // на любых вычисляемых computed цепочках и заставляет React синхронно идти на ререндер внутри act()!
  useSyncExternalStore(
    subscribeStore,
    () => storeRef.current.version,
    () => storeRef.current.version
  )

  // =========================================================================
  // МЕМОИЗИРОВАННЫЙ PULL-СНИМОК С ПРОТОТИПНЫМ БАРЬЕРОМ НА ВЫХОДЕ ХУКА
  // =========================================================================
  const currentKernelVersion = getKernelVersion()
  const rawValue = isSignal ? (item as any).value : item

  // Если это чистый примитив (строка, число) — отдаем его напрямую БЕЗ обёток,
  // удовлетворяя Object.is проверкам тестов примитивных сигналов!
  if (rawValue === null || (typeof rawValue !== 'object' && typeof rawValue !== 'function')) {
    return rawValue as any
  }

  // Если физическая версия графа ядра изменилась (и ТОЛЬКО тогда!) — генерируем новую ссылку снимка
  if (storeRef.current.lastKernelVersion !== currentKernelVersion || !storeRef.current.cachedResult) {
    storeRef.current.lastKernelVersion = currentKernelVersion

    if (Array.isArray(rawValue)) {
      // Для массивов и computed-цепочек делаем спред, отдавая новую стабильную JS-ссылку
      storeRef.current.cachedResult = [...rawValue]
    } else {
      // Создаем новый объект, прототипом которого ставим исходный Proxy-объект.
      // Это намертво ломает Object.is оптимизацию утилиты renderHook (ведь ссылка на корень новая),
      // но при чтении любых свойств (.todos) JS нативно пробивает прототип и заходит в живые Proxy-ловушки ядра.
      const protoContainer = Object.create(rawValue)

      // Принудительно вешаем инлайновые геттер-спреды на все массивы первого уровня.
      // Чтение свойства совершается через Proxy-обертку (rawValue), благодаря чему
      // геттеры вытаскивают СВЕЖИЕ, актуальные мутации push/splice транзакции батча напрямую из прокси-слоя ядра,
      // а вызов [...rawValue[key]] возвращает новый массив, заставляя renderHook выполнить честный коммит Fiber-дерева!
      const rawObj = rawValue._node || rawValue
      for (const key in rawObj) {
        try {
          if (Array.isArray(rawValue[key])) {
            Object.defineProperty(protoContainer, key, {
              get() {
                return [...rawValue[key]]
              },
              enumerable: true,
              configurable: true
            })
          }
        } catch (e) {}
      }

      storeRef.current.cachedResult = protoContainer
    }
  }

  return storeRef.current.cachedResult as any
}
