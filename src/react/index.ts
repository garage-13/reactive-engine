// Точка входа субпакета "@pravosleva/reactive-engine/react"
import { ReactiveEngineCore } from '../core/core'
import { useReactiveValue } from './hooks/useReactiveValue'
import { ISignalLike } from '../core/types'

/**
 * 🟢 КАНОНИЧЕСКИЙ ИНТЕРФЕЙС ПЕРЕГРУЗОК ТИПОВ ДЛЯ СВОБОДНОЙ ФУНКЦИИ-ХУКА
 * Гарантирует автовыведение типов (V или T) в тестах и компонентах без кастов к any!
 */
export interface IUseReactiveHook {
  <V>(item: ISignalLike<V>): V;
  <T>(item: T): T;
}

/**
 * Экспортируем хук под именем use с жестким сохранением перегрузок типов дженерика
 */
export const use: IUseReactiveHook = useReactiveValue as any;

/**
 * Расширенная версия движка ядра для ООП/DI паттернов в React-среде
 */
export class ReactiveEngine extends ReactiveEngineCore {
  /**
   * Сценарий 1: На вход подан легитимный реактивный примитив (Signal или Computed)
   */
  public use<V>(item: ISignalLike<V>): V;

  /**
   * Сценарий 2: На вход подан Proxy-объект, массив или обычный примитив
   */
  public use<T>(item: T): T;

  /**
   * Исполняемая сигнатура метода экземпляра класса движка
   */
  public use(item: any): any {
    return useReactiveValue(item)
  }
}

// Сохраняем остальные экспорты пакета
export { useReactiveValue }
export { useReactiveSubscription } from './hooks/useReactiveSubscription'
