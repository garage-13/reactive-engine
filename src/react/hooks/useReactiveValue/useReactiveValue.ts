import { useSyncExternalStore, useCallback, useMemo, useEffect, useRef } from 'react'
import { CleanupFn } from '../../../core'

interface ObservableItem<T> {
  readonly value: T;
  subscribe: (cb: (val: T) => void) => CleanupFn
  destroy?: () => void
}

type ReactiveInput<T> = ObservableItem<T> | (() => ObservableItem<T>)

/**
 * Нативный React-хук для извлечения текущего значения из реактивных примитивов ядра
 * (Signal, Computed, Resource) и автоматического управления подпиской на рендеринг.
 *
 * Опирается на каноничную шим-прослойку `useSyncExternalStore`, что гарантирует 100%
 * совместимость с механизмами батчинга обновлений React 18+ и Concurrent Mode (защита от Tearing).
 *
 * ### Особенности управления памятью:
 * 1. **Глобальные сигналы (Сервисы/Синглтоны):** При размонтировании компонента хук выполняет
 *    только стандартную отписку от обновлений. Метод `.destroy()` **не вызывается**,
 *    что сохраняет глобальное состояние системы в безопасности.
 * 2. **Локальные фабрики (`() => engine.computed(...)`):** Если в качестве аргумента передана
 *    функция-фабрика, хук понимает, что вычисление создано локально для этого экрана.
 *    При анмаунте компонента хук автоматически вызовет `.destroy()`, предотвращая утечки памяти в ядре.
 *
 * @template T - Тип данных, инкапсулированных внутри реактивного элемента.
 * @param {ReactiveInput<T>} input - Готовый реактивный элемент ядра или ленивая функция-фабрика, возвращающая его.
 * @returns {T} Актуальное синхронизированное значение реактивного элемента.
 *
 * @example
 * ```tsx
 * import { useReactiveValue } from '@pravosleva/reactive-engine/react';
 * import { userInfoService } from '~/store';
 *
 * // Сценарий 1: Прямая подписка на долгоживущий сигнал сервиса
 * export const CounterDisplay = () => {
 *   const counter = useReactiveValue(userInfoService.counter);
 *   return <span>Значение: {counter}</span>;
 * };
 *
 * // Сценарий 2: Использование ленивой фабрики для локальных вычислений (авто-очистка ядра при анмаунте)
 * export const FilteredList = ({ query }: { query: string }) => {
 *   const filteredData = useReactiveValue(() =>
 *     engine.computed(() => userInfoService.list.value.filter(item => item.includes(query)))
 *   );
 *   return <ul>{filteredData.map(item => <li key={item}>{item}</li>)}</ul>;
 * };
 * ```
 */
export const useReactiveValue = <T>(input: ReactiveInput<T>): T => {
  const isFactory = typeof input === 'function';

  // NOTE: СТАБИЛИЗАЦИЯ ФАБРИКИ: Сохраняем ссылку на функцию в ref,
  // чтобы не перезапускать вычисления, если разработчик передал инлайн-стрелочную функцию.
  const factoryRef = useRef(input);
  useEffect(() => {
    factoryRef.current = input;
  }, [input]);

  // Вычисляем элемент строго один раз при инициализации, либо при изменении стабильной ссылки на готовый сигнал
  const reactiveItem = useMemo(() => {
    if (typeof input === 'function') {
      // Вызываем фабрику только при первом проходе
      return input();
    }
    return input; // Если передан готовый сигнал/ресурс — используем его напрямую
  }, [isFactory ? undefined : input]); // Стабильный массив зависимостей для фабрик!

  const subscribe = useCallback(
    (reactCallback: () => void) => {
      return reactiveItem.subscribe(reactCallback)
    },
    [reactiveItem]
  )

  const getSnapshot = useCallback(() => {
    return reactiveItem.value
  }, [reactiveItem])

  // NOTE: БЕЗОПАСНАЯ ОЧИСТКА ПАМЯТИ:
  // Вызываем .destroy() ТОЛЬКО если объект пришел из локальной фабрики `() => engine.computed(...)`.
  // Если это глобальный сигнал из сервиса — мы делаем только стандартный unmount подписки через useSyncExternalStore.
  useEffect(() => {
    return () => {
      if (isFactory && reactiveItem && typeof reactiveItem.destroy === 'function') {
        reactiveItem.destroy();
      }
    }
  }, [reactiveItem, isFactory])

  return useSyncExternalStore(subscribe, getSnapshot)
}
