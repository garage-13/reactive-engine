import { useState, useEffect, useRef, useMemo } from "react";
import { CleanupFn } from '../core';

interface ObservableItem<T> {
  readonly value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn;
  destroy?: () => void;
}

type ReactiveInput<T> = ObservableItem<T> | (() => ObservableItem<T>);

/**
 * Fallback хук для извлечения значения из сигналов. Поддерживает React 16.8+.
 *
 * @source
 */
export const useReactiveValue0 = <T>(input: ReactiveInput<T>): T => {
  const reactiveItem = useMemo(() => {
    return typeof input === 'function' ? input() : input;
  }, [input]);

  const [state, setState] = useState<T>(reactiveItem.value);
  const setStateRef = useRef(setState);

  useEffect(() => {
    setStateRef.current = setState;
  }, [setState]);

  useEffect(() => {
    setStateRef.current(reactiveItem.value);

    const unsubscribe = reactiveItem.subscribe((newValue) => {
      setStateRef.current(newValue);
    });

    return () => {
      unsubscribe();
      if (reactiveItem && typeof reactiveItem.destroy === 'function') {
        reactiveItem.destroy();
      }
    };
  }, [reactiveItem]);

  return state;
};
