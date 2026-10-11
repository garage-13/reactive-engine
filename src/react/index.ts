// Точка входа субпакета "@pravosleva/reactive-engine/react"
import { ReactiveEngineAutomatic } from '../core/core.automatic'
import { useReactiveValue } from './hooks/useReactiveValue'
import { ISignalLike } from '../core/types'

class ExtendedReactiveEngine extends ReactiveEngineAutomatic {
  public use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
    return useReactiveValue(item)
  }
}

export { ExtendedReactiveEngine as ReactiveEngine, useReactiveValue as use }
export { useReactiveValue }
export { useReactiveSubscription } from './hooks/useReactiveSubscription'
