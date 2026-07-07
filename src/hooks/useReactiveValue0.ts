import { useState, useEffect, useRef } from "react";
import { Signal, CleanupFn } from '../core';

/**
 * NOTE: (v1) Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента.
 *
 * Классический (React 16.8+) через useState + useEffect
 * Если вам нужна обратная совместимость со старыми версиями React, где нет useSyncExternalStore, используем классическую связку.
 */
export const useReactiveValue0 = <T>(
  reactiveItem: Pick<Signal<T>, 'value' | 'subscribe'>
): T => {
  // Инициализируем стейт текущим значением сигнала
  const [state, setState] = useState<T>(reactiveItem.value);

  // Храним ссылку на актуальный setter стейта
  const setStateRef = useRef(setState);
  useEffect(() => {
    setStateRef.current = setState;
  }, [setState]);

  useEffect(() => {
    // При изменении реактивного элемента синхронизируем локальный стейт
    setStateRef.current(reactiveItem.value);

    // Подписываемся на будущие изменения
    const unsubscribe: CleanupFn = reactiveItem.subscribe((newValue) => {
      setStateRef.current(newValue);
    });

    return unsubscribe;
  }, [reactiveItem]);

  return state;
};
