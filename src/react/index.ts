// Точка входа субпакета "@pravosleva/reactive-engine/react"
import { ReactiveEngineCore } from '../core/core'
import { useReactiveValue } from './hooks/useReactiveValue'
import { ISignalLike } from '../core/types'

class ExtendedReactiveEngine extends ReactiveEngineCore {
  /**
   * Сценарий 1: На вход подан легитимный реактивный примитив (Signal или Computed)
   */
  public use<V>(item: ISignalLike<V>): V;

  /**
   * Сценарий 2: На вход подан Proxy-объект, массив или обычный примитив
   */
  public use<T>(item: T): T;

  /**
   * Исполняемая сигнатура метода
   */
  public use(item: any): any {
    return useReactiveValue(item)
  }
}

export { ExtendedReactiveEngine as ReactiveEngine, useReactiveValue as use }
export { useReactiveValue }
export { useReactiveSubscription } from './hooks/useReactiveSubscription'
