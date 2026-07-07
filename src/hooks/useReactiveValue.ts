import { useSyncExternalStore } from "react";
import { Signal } from '../core';

/**
 * NOTE: (v2) Современный (React 18+) через useSyncExternalStore
 * Это самый надежный, производительный и лаконичный способ подружить реактивные сигналы с React.
 *
 * Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента.
 *
 * @template T Тип данных в контейнере
 * @param {Signal<T> | Computed<T> | Resource<T>} reactiveItem Любой реактивный объект с .value и .subscribe
 */
export const useReactiveValue = <T>(
  reactiveItem: Pick<Signal<T>, 'value' | 'subscribe'>
): T => {
  return useSyncExternalStore(
    // 1. Функция подписки (React сам вызывает её при монтировании и очищает при размонтировании)
    reactiveItem.subscribe,
    // 2. Функция получения текущего snapshot значения
    () => reactiveItem.value
  );
};
