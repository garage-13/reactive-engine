export { toAngularSignal } from './core.angular-adapter'

import { signal, inject, DestroyRef, Injector, runInInjectionContext, type Signal } from '@angular/core'
import { ReactiveEngineAutomatic } from '../core'
import { type CleanupFn } from '../core/types'

export interface AngularUseOptions {
  /**
   * Кастомный инжектор Angular.
   * Позволяет использовать .use() вне конструктора (например, в асинхронных функциях),
   * если передать текущий Injector вручную.
   */
  injector?: Injector
}

export class ReactiveEngine extends ReactiveEngineAutomatic {
  protected override frameworkPrefix = 'angular'

  /**
   * Использование реактивного значения (Signal, Computed, Resource или Reactive Proxy) в Angular.
   * Возвращает стандартный неизменяемый Angular Signal.
   */
  public use<T>(
    item: any,
    options?: AngularUseOptions
  ): Signal<any> {
    if (item === null || item === undefined) {
      return signal(item).asReadonly()
    }

    const isSignalOrComputed = 'subscribe' in item && typeof item.subscribe === 'function'
    
    const getFreshValue = () => {
      if (isSignalOrComputed) return item.value
      return item
    }

    const angularSignal = signal<any>(getFreshValue())
    let isPendingUpdate = false

    const triggerUpdate = () => {
      if (isPendingUpdate) return
      isPendingUpdate = true
      
      angularSignal.set(getFreshValue())
      
      // Синхронно разжимаем защёлку, позволяя Angular подхватывать
      // асинхронные хвостовые вызовы (trailing edge) декораторов ядра
      isPendingUpdate = false
    }

    let unsubscribe: CleanupFn | null = null

    if (isSignalOrComputed) {
      unsubscribe = item.subscribe(triggerUpdate)
    } else if ('__subscribe' in item && typeof item.__subscribe === 'function') {
      unsubscribe = item.__subscribe(triggerUpdate)
    }

    if (unsubscribe) {
      const activeUnsub = unsubscribe
      const registerCleanup = () => {
        try {
          const destroyRef = inject(DestroyRef)
          destroyRef.onDestroy(() => {
            activeUnsub()
          })
        } catch (e) {}
      }

      if (options?.injector) {
        runInInjectionContext(options.injector, registerCleanup)
      } else {
        registerCleanup()
      }
    }

    return angularSignal.asReadonly()
  }
}
