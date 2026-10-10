import { signal, DestroyRef, inject, WritableSignal, Signal as NgSignal } from '@angular/core'
import { ISignalLike } from '../core/types'

type CleanupFn = () => void

/**
 * 🔴 REACTIVE ENGINE ADAPTER FOR ANGULAR (v1.9.0)
 *
 * Нативно интегрирует синхронные и асингулярные графы ядра с Angular Signals.
 * Автоматически отписывается от утечек памяти через DestroyRef контекст инъекций.
 */

/**
 * Функция-адаптер для преобразования реактивных примитивов ядра в Angular Signals.
 * @param item Сигнал, Компьютед или Reactive-Proxy ядра
 * @param injectRef Опциональный DestroyRef (если вызывается вне конструктора/inject-контекста)
 */
export function toAngularSignal<T>(
  item: T,
  injectRef?: DestroyRef
): NgSignal<T extends ISignalLike<infer V> ? V : T> {

  if (item === null || item === undefined || typeof item !== 'object') {
    return signal(item as any).asReadonly()
  }

  const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

  // Инициализируем нативный WritableSignal из Angular стартовым значением из ядра
  const ngSignal: WritableSignal<any> = signal(isSignal ? (item as any).value : item)
  let unsubscribe: CleanupFn | null = null

  // =========================================================================
  // СЦЕНАРИЙ 1: Подписка на Сигналы и Вычисляемые свойства (Computed)
  // =========================================================================
  if (isSignal) {
    const signalItem = (item as unknown) as ISignalLike<unknown>
    unsubscribe = signalItem.subscribe((newValue: any) => {
      // Синхронно пушим обновление в Angular Signal
      ngSignal.set(newValue)
    })
  }
  // =========================================================================
  // СЦЕНАРИЙ 2: Подписка на глубокие Proxy-объекты и массивы (reactive)
  // =========================================================================
  else if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
    const reactiveItem = item as any
    unsubscribe = reactiveItem.__subscribe(() => {
      // Для Proxy-массивов вызываем .update() с поверхностным спредом ссылки,
      // чтобы Change Detection в Angular мгновенно отловил изменения .push()/.splice()
      ngSignal.update((prev) => Array.isArray(reactiveItem) ? [...reactiveItem] : { ...reactiveItem })
    })
  }

  // Разрешаем контекст уничтожения для автоматического GC (Garbage Collection)
  let destroyRef: DestroyRef | null = null
  try {
    destroyRef = injectRef || inject(DestroyRef)
  } catch (e) {
    // Вызвано вне контекста инъекций Angular (например, в сырых функциях) и injectRef не передан
    if (!injectRef) {
      console.warn('[Reactive Engine Angular Adapter] Вызов toAngularSignal осуществлен вне контекста инъекций. Не забудьте передать DestroyRef вторым аргументом для защиты от утечек памяти.')
    }
  }

  if (unsubscribe && destroyRef) {
    destroyRef.onDestroy(() => {
      unsubscribe!()
    })
  }

  // Возвращаем как Readonly Signal, защищая стейт от несанкционированных внешних записей (.set/.update) во вьюхах
  return ngSignal.asReadonly()
}
