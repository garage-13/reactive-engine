import { CleanupFn } from '../../core';

/**
 * Общий интерфейс-контракт для любого реактивного объекта библиотеки,
 * у которого есть чтение значения, метод подписки и опциональный метод уничтожения.
 */
export interface ObservableItem<T> {
  readonly value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn;
  destroy?: () => void;
}

/**
 * Тип-союз: на вход хука можно подать либо сам реактивный объект,
 * либо функцию-фабрику, которая его лениво возвращает.
 */
export type ReactiveInput<T> = ObservableItem<T> | (() => ObservableItem<T>);
