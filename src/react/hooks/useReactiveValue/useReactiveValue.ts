import { useSyncExternalStore, useCallback, useMemo, useEffect, useRef, useState } from 'react'

type CleanupFn = () => void

// Описываем строгий контракт для примитивов реактивного ядра (Signals / Computed / Resources)
export interface ISignalLike<V> {
  readonly value: V;
  subscribe: (cb: (val: V) => void) => CleanupFn
  destroy?: () => void
}

type ReactiveInput<T> = ISignalLike<T> | (() => ISignalLike<T>) | object | (() => object)

/**
 * Нативный React-хук для извлечения текущего значения из реактивных примитивов ядра
 * (Signal, Computed, Resource) и глубоких реактивных Proxy-объектов (reactive).
 *
 * @template T - Тип входящих данных
 * @param {ReactiveInput<any>} input - Готовый реактивный элемент ядра или функция-фабрика
 * @returns {any} Актуальное синхронизированное значение элемента или сам прокси-объект
 */
export const useReactiveValue = <T>(input: ReactiveInput<any>): any => {
  const isFactory = typeof input === 'function'

  // Стабилизируем ссылку на фабрику
  const factoryRef = useRef(input)
  useEffect(() => {
    factoryRef.current = input
  }, [input])

  // Вычисляем целевой элемент один раз
  const reactiveItem = useMemo(() => {
    if (typeof input === 'function') {
      return input()
    }
    return input
  }, [isFactory ? undefined : input])

  // Определяем, является ли объект примитивом (Signal/Computed) или это Proxy-объект reactive()
  const isSignal = reactiveItem &&
                   typeof reactiveItem === 'object' &&
                   'subscribe' in reactiveItem &&
                   typeof (reactiveItem as Record<string, unknown>).subscribe === 'function'

  // ------------------------------------------------====
  // СЦЕНАРИЙ А: Работа с атомарными Сигналами / Computed (useSyncExternalStore)
  // ------------------------------------------------====
  const subscribe = useCallback(
    (reactCallback: () => void) => {
      if (isSignal) {
        return (reactiveItem as ISignalLike<unknown>).subscribe(reactCallback)
      }
      return () => {}
    },
    [reactiveItem, isSignal]
  )

  const getSnapshot = useCallback(() => {
    if (isSignal) {
      return (reactiveItem as ISignalLike<unknown>).value
    }
    return reactiveItem
  }, [reactiveItem, isSignal])

  // Безопасная очистка локальных фабрик ядра при размонтировании экрана
  useEffect(() => {
    return () => {
      if (isFactory && reactiveItem && 'destroy' in reactiveItem && typeof (reactiveItem as any).destroy === 'function') {
        (reactiveItem as any).destroy()
      }
    }
  }, [reactiveItem, isFactory])

  // Если это сигнал — используем Concurrent-безопасныйuseSyncExternalStore
  if (isSignal) {
    return useSyncExternalStore(subscribe, getSnapshot)
  }

  // ------------------------------------------------====
  // СЦЕНАРИЙ Б: Работа с глубокими Proxy-объектами / Массивами
  // ------------------------------------------------====
  // Для Proxy-объектовuseSyncExternalStore не подходит, так как у них нет .value.
  // Мы создаем локальный forceUpdate и подписываем его через скрытый геттер __subscribe адаптера
  const [, forceUpdate] = useState([])

  useEffect(() => {
    if (reactiveItem && '__subscribe' in reactiveItem && typeof (reactiveItem as any).__subscribe === 'function') {
      const unsubscribe = (reactiveItem as any).__subscribe(() => {
        forceUpdate([]) // Провоцируем ререндер компонента через автобатчинг микрозадач
      })
      return () => unsubscribe()
    }
  }, [reactiveItem])

  return reactiveItem
}
