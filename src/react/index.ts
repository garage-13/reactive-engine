// Точка входа субпакета "@pravosleva/reactive-engine/react"
import { ReactiveEngineAutomatic } from '../core/core.automatic'
import { use } from './hooks/useReactiveValue'
import { ISignalLike } from '../core/types'

class ExtendedReactiveEngine extends ReactiveEngineAutomatic {
  public use<T>(item: T): T extends ISignalLike<infer V> ? V : T {
    return use(item)
  }
}

export { ExtendedReactiveEngine as ReactiveEngine, use }
export { use as useReactiveValue }
export { useReactiveSubscription } from './hooks/useReactiveSubscription'
