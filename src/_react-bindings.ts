import { useState, useEffect } from 'react';
import { ReactiveEngine } from './core'; // Путь к вашему ядру
import { Signal, Computed, Resource } from './core';

/* NOTE
Вместо того чтобы заставлять пользователя каждый раз писать engine.use(mySignal),
мы дадим ему три лаконичных хука: useSignal, useComputed и useResource.
*/

// 1. Создаем единый экземпляр движка для приложения
export const engine = new ReactiveEngine();

// 2. Сразу инициализируем адаптеры, чтобы пользователю не нужно было делать это вручную
engine.setReactAdapters(useState, useEffect);

/**
 * Хук для получения текущего значения Signal и его авто-обновления в React.
 */
export function useSignal<T>(signal: Signal<T>): T {
  // Используем ваш встроенный проверенный метод
  return engine.use(signal);
}

/**
 * Хук для получения значения вычисляемого свойства Computed.
 */
export function useComputed<T>(computed: Computed<T>): T {
  return engine.use(computed);
}

/**
 * Хук для реактивного отслеживания асинхронного ресурса.
 * Возвращает объект состояния { data, loading, error }
 */
export function useResource<T>(resource: Resource<T>) {
  // Передаем весь объект resource, так как у него есть свойство value со структурой ResourceState
  return engine.use(resource);
}
