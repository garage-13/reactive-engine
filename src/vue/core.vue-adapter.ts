import { shallowRef, onScopeDispose, ShallowRef } from 'vue'
import { ISignalLike, CleanupFn } from '../core/types'

/**
 * ⚛️ Расширенный интерфейс для поддержки внутренних методов подписки Proxy-объектов ядра
 */
interface IReactiveProxyExtension {
  __subscribe?: (cb: () => void) => CleanupFn;
}

/**
 * 🟢 REACTIVE ENGINE ADAPTER FOR VUE 3 (v2.6.1)
 *
 * Нативно интегрирует синхронные и асинхронные графы ядра с реактивной системой Vue 3.
 * Автоматически выводит тип внутренней структуры данных и возвращает строго типизированный ShallowRef.
 */
export function useReactiveValue<V>(signal: ISignalLike<V>): ShallowRef<V>;
export function useReactiveValue<T extends object>(proxy: T): ShallowRef<T>;
export function useReactiveValue<T>(primitive: T): ShallowRef<T>;
export function useReactiveValue(item: unknown): ShallowRef<unknown> {
  // Быстрый выход для примитивов или невалидных объектов, переданных по ошибке
  if (item === null || item === undefined || typeof item !== 'object') {
    return shallowRef(item)
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  // Вычисляем стартовое значение без использования unsafe any
  const getInitialValue = (): unknown => {
    if (isSignal) {
      return (item as ISignalLike<unknown>).value
    }
    return item
  }

  // Инициализируем реактивный контейнер Vue 3 стартовым снимком из ядра
  const stateRef = shallowRef(getInitialValue())
  let unsubscribe: CleanupFn | null = null

  // =========================================================================
  // СЦЕНАРИЙ 1: Подписка на Сигналы и Вычисляемые свойства (Computed)
  // =========================================================================
  if (isSignal) {
    const signalItem = item as ISignalLike<unknown>
    unsubscribe = signalItem.subscribe((newValue) => {
      stateRef.value = newValue // Vue 3 автоматически триггерит обновление DOM
    })
  }
  // =========================================================================
  // СЦЕНАРИЙ 2: Подписка на глубокие Proxy-объекты и массивы (reactive)
  // =========================================================================
  else if ('__subscribe' in item) {
    const potentialProxy = item as IReactiveProxyExtension
    if (typeof potentialProxy.__subscribe === 'function') {
      unsubscribe = potentialProxy.__subscribe(() => {
        // Для Proxy-коллекций принудительно создаем shallow-копию ссылки,
        // заставляя ленивый движок Vue 3 безупречно перерисовывать шаблоны .push/.splice мутаций!
        stateRef.value = Array.isArray(item) ? [...item] : { ...item }
      })
    }
  }

  // Автоматически освобождаем оперативную память и гасим эффекты ядра
  // при размонтировании Vue-компонента или закрытии EffectScope
  if (unsubscribe) {
    onScopeDispose(() => {
      if (unsubscribe) unsubscribe()
    })
  }

  return stateRef
}
