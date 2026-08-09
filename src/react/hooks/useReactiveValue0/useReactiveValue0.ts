import { useState, useEffect, useRef, useMemo } from 'react'
import { CleanupFn } from '../../../core'

interface ObservableItem<T> {
  readonly value: T
  subscribe: (cb: (val: T) => void) => CleanupFn
  destroy?: () => void
}

type ReactiveInput<T> = ObservableItem<T> | (() => ObservableItem<T>)

/**
 * Изоморфный фоллбэк-хук для извлечения текущего значения из реактивных примитивов ядра
 * (Signal, Computed, Resource) и управления подпиской в окружениях **React 16.8+ и React 17**.
 *
 * В отличие от современной версии `useReactiveValue`, данный хук спроектирован на базе классической
 * связки `useState` + `useEffect`. Он содержит встроенный механизм упреждающей синхронизации
 * (Pre-emptive Synchronization Pattern), предотвращающий рассинхронизацию данных (Tearing) и мерцание UI
 * во время асинхронных микрозадач планировщика React.
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
 * import { useReactiveValue0 } from '@pravosleva/reactive-engine/react';
 * import { userInfoService } from '~/store';
 *
 * // Сценарий 1: Прямая подписка на долгоживущий сигнал сервиса в legacy-компоненте
 * export const LegacyCounterDisplay = () => {
 *   const counter = useReactiveValue0(userInfoService.counter);
 *   return <span>Значение: {counter}</span>;
 * };
 *
 * // Сценарий 2: Использование ленивой фабрики во React 17 проектах (авто-очистка ядра при анмаунте)
 * export const LegacyFilteredList = ({ query }: { query: string }) => {
 *   const filteredData = useReactiveValue0(() =>
 *     engine.computed(() => userInfoService.list.value.filter(item => item.includes(query)))
 *   );
 *   return <ul>{filteredData.map(item => <li key={item}>{item}</li>)}</ul>;
 * };
 * ```
 */
export const useReactiveValue0 = <T>(input: ReactiveInput<T>): T => {
  const isFactory = typeof input === 'function';

  // NOTE: СТАБИЛИЗАЦИЯ ИНПУТА: защищает от бесконечных циклов при инлайн-стрелочных фабриках
  const factoryRef = useRef(input);
  useEffect(() => {
    factoryRef.current = input;
  }, [input]);

  // Вычисляем элемент строго 1 раз при монтировании, либо при смене ссылки на готовый сигнал
  const reactiveItem = useMemo(() => {
    if (typeof input === 'function') {
      return input(); // Ленивый вызов фабрики ровно один раз за жизнь компонента
    }
    return input;
  }, [isFactory ? undefined : input]); // Игнорируем ссылки инлайн-функций

  const [state, setState] = useState<T>(reactiveItem.value)
  const setStateRef = useRef(setState)

  // Держим ссылку на setState всегда актуальной для безопасных асинхронных вызовов
  useEffect(() => {
    setStateRef.current = setState
  }, [setState])

  // NOTE: СИНХРОНИЗАЦИЯ НА ОПЕРЕЖЕНИЕ (Теккущее значение):
  // Если между фазой рендера и выполнением useEffect значение в ядре библиотеки успело измениться,
  // мы синхронно подтягиваем актуальный стейт, исключая "слепые пятна" и мерцание UI.
  if (state !== reactiveItem.value) {
    setState(reactiveItem.value);
  }

  useEffect(() => {
    // Привязываем подписку ядра к триггеру обновлений React
    const unsubscribe = reactiveItem.subscribe((newValue) => {
      setStateRef.current(newValue)
    })

    return () => {
      unsubscribe();

      // NOTE: БЕЗОПАСНАЯ ОЧИСТКА ПАМЯТИ:
      // Метод .destroy() вызывается СТРОГО если объект был порожден локальной фабрикой.
      // Глобальные сигналы сервисов остаются в безопасности и не стираются из движка!
      if (isFactory && reactiveItem && typeof reactiveItem.destroy === 'function') {
        reactiveItem.destroy()
      }
    }
  }, [reactiveItem, isFactory])

  return state
}
