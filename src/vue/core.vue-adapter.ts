import { shallowRef, onScopeDispose } from 'vue'
import { ISignalLike } from '../core/types'

type CleanupFn = () => void

/**
 * 🟢 REACTIVE ENGINE ADAPTER FOR VUE 3 (v1.9.0)
 *
 * Нативно интегрирует синхронные и асингулярные графы ядра с реактивной системой Vue 3.
 * Исключает десинхронизацию за счет shallowRef-трансляции и триггеров onScopeDispose.
 */
export function useReactiveValue<T>(item: T): any {
  // Быстрый выход для примитивов или невалидных объектов, переданных по ошибке
  if (item === null || item === undefined || typeof item !== 'object') {
    return shallowRef(item)
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  // Инициализируем реактивный контейнер Vue 3 стартовым снимком из ядра
  const stateRef = shallowRef(isSignal ? (item as any).value : item)
  let unsubscribe: CleanupFn | null = null

  // =========================================================================
  // СЦЕНАРИЙ 1: Подписка на Сигналы и Вычисляемые свойства (Computed)
  // =========================================================================
  if (isSignal) {
    const signalItem = (item as unknown) as ISignalLike<unknown>
    unsubscribe = signalItem.subscribe((newValue: any) => {
      stateRef.value = newValue // Vue 3 автоматически триггерит обновление DOM
    })
  }
  // =========================================================================
  // СЦЕНАРИЙ 2: Подписка на глубокие Proxy-объекты и массивы (reactive)
  // =========================================================================
  else if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
    const reactiveItem = item as any
    unsubscribe = reactiveItem.__subscribe(() => {
      // Для Proxy-коллекций принудительно создаем shallow-копию ссылки,
      // заставляя ленивый движок Vue 3 безупречно перерисовывать шаблоны .push/.splice мутаций!
      stateRef.value = Array.isArray(reactiveItem) ? [...reactiveItem] : { ...reactiveItem }
    })
  }

  // Автоматически освобождаем оперативную память и гасим эффекты ядра
  // при размонтировании Vue-компонента или закрытии EffectScope
  if (unsubscribe) {
    onScopeDispose(() => {
      unsubscribe!()
    })
  }

  return stateRef
}
