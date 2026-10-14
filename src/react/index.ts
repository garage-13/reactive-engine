import { ReactiveEngineCore } from '../core/core'
import { useReactiveValue } from './hooks/useReactiveValue'
import { ISignalLike } from '../core/types'

export interface IUseReactiveHook {
  <V>(item: ISignalLike<V>): V;
  <T>(item: T): T;
}

export const use: IUseReactiveHook = useReactiveValue as any

/**
 * Расширенная версия движка ядра для ООП/DI паттернов в React-среде
 */
export class ReactiveEngine extends ReactiveEngineCore {
  public use<V>(item: ISignalLike<V>): V;
  public use<T>(item: T): T;
  public use(item: any): any {
    return useReactiveValue(item)
  }
  // Метод inject удален отсюда, так как он нативно наследуется из ReactiveEngineCore без хуков!
}

export { useReactiveValue }
export { useReactiveSubscription } from './hooks/useReactiveSubscription'
