import React, { useSyncExternalStore, useMemo, useEffect, useRef } from 'react';
import { ReactiveEngine } from '../core';

/**
 * Свойства для инлайн-компонента {@link Observer}.
 */
interface ObserverProps {
  /**
   * Функция-рендер, возвращающая JSX-разметку.
   * Сигналы, прочитанные внутри этого коллбека, будут автоматически отслеживаться.
   */
  children: () => React.ReactNode;
}

/**
 * Фабрика для создания инлайн-компонента `<Observer>`.
 *
 * @param engine - Экземпляр реактивного движка {@link ReactiveEngine}.
 * @returns Специальный React-компонент для точечной изоляции реактивных обновлений в JSX.
 *
 * @example
 * ```tsx
 * import { createObserverComponent, engine } from '@pravosleva/reactive-engine';
 *
 * const Observer = createObserverComponent(engine);
 * const priceSignal = engine.signal(100);
 *
 * export const MyComponent = () => {
 *   return (
 *     <div>
 *       <h1>Статический тяжелый контент (не перерисовывается)</h1>
 *       <Observer>
 *         {() => <span>Живая цена: {priceSignal.value}</span>}
 *       </Observer>
 *     </div>
 *   );
 * };
 * ```
 */
export const createObserverComponent = (engine: ReactiveEngine) => {
  return ({ children }: ObserverProps): any => {
    const versionRef = useRef(0);
    const onStoreChangeRef = useRef<(() => void) | null>(null);

    // Ссылки для удержания инстанса эффекта и функции отписки
    const unsubscribeRef = useRef<(() => void) | null>(null);
    const effectObjRef = useRef<any>(null);

    // 1. Создаем стабильный мост подписки для React ОДИН раз за жизнь компонента
    const storeBridge = useMemo(() => {
      return {
        subscribe(onStoreChange: () => void) {
          onStoreChangeRef.current = onStoreChange;
          return () => {
            onStoreChangeRef.current = null;
            if (unsubscribeRef.current) {
              unsubscribeRef.current();
              unsubscribeRef.current = null;
              effectObjRef.current = null;
            }
          };
        },
        getSnapshot() {
          return versionRef.current;
        }
      };
    }, []);

    // Очистка при полном размонтировании из DOM
    useEffect(() => {
      return () => {
        if (unsubscribeRef.current) unsubscribeRef.current();
      };
    }, []);

    // 2. ЛЕЗИ-ИНИЦИАЛИЗАЦИЯ: Создаем реактивный эффект ядра ровно 1 раз.
    // Этот эффект будет жить вечно вместе с компонентом и никогда не сбросит свои подписки!
    if (!unsubscribeRef.current) {
      unsubscribeRef.current = engine.effect(() => {
        // Если этот эффект триггерится асинхронно из-за изменения сигнала в ядре:
        if (onStoreChangeRef.current) {
          versionRef.current++; // Инкрементируем версию снапшота для React

          // Мягко пушим React на ререндер через микрозадачу
          queueMicrotask(() => {
            if (onStoreChangeRef.current) {
              onStoreChangeRef.current();
            }
          });
        }
      });

      // Хак: Вытаскиваем ссылку на сам объект эффекта, который только что зарегился в ядре
      effectObjRef.current = Array.from((engine as any).allEffects).pop();
    }

    // 3. ГЛАВНАЯ МАГИЯ: Каждый раз, когда React заходит на рендер (включая StrictMode),
    // мы вручную подменяем activeEffect ядра на НАШ долгоживущий эффект на время выполнения children().
    // Это заставляет ядро автоматически ДОБАВЛЯТЬ новые сигналы в зависимости и никогда не терять старые!
    const prevActiveEffect = (engine as any).activeEffect;
    (engine as any).activeEffect = effectObjRef.current;

    let result: React.ReactNode = null;
    try {
      result = children(); // Синхронно выполняем рендер компонента и собираем сигналы
    } finally {
      // Возвращаем глобальный контекст ядра в исходное состояние
      (engine as any).activeEffect = prevActiveEffect;
    }

    // Подключаем нативныйuseSyncExternalStore к нашей стабильной версии стейта
    useSyncExternalStore(storeBridge.subscribe, storeBridge.getSnapshot);

    return result as unknown as React.ReactElement;
  };
};

/**
 * Функция высшего порядка (HOC) для автоматического отслеживания сигналов внутри React-компонента.
 * Полный аналог `observer` из MobX.
 *
 * @template P - Объект пропсов оборачиваемого компонента.
 * @param engine - Экземпляр реактивного движка {@link ReactiveEngine}.
 * @returns Функция-декоратор, преобразующая обычный компонент в реактивный.
 *
 * @example
 * ```tsx
 * import { createObserver, engine } from '@pravosleva/reactive-engine';
 *
 * const observer = createObserver(engine);
 * const counterSignal = engine.signal(0);
 *
 * // Компонент автоматически перерисуется при изменении counterSignal.value
 * export const CounterView = observer(() => {
 *   return (
 *     <div>
 *       <p>Счетчик: {counterSignal.value}</p>
 *       <button onClick={() => counterSignal.value++}>+1</button>
 *     </div>
 *   );
 * });
 * ```
 *
 * @source
 */
export const createObserver = (engine: ReactiveEngine) => {
  const Observer = createObserverComponent(engine);

  return <P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> => {
    const ObserverComponent = (props: P) => {
      const TargetComponent = Component;

      return (
        <Observer>
          {() => {
            if (typeof TargetComponent === 'function' && !TargetComponent.prototype?.isReactComponent) {
              return (TargetComponent as Function)(props);
            }
            return React.createElement(TargetComponent, props);
          }}
        </Observer>
      );
    };

    ObserverComponent.displayName = `Observer(${Component.displayName || Component.name || 'Component'})`;
    return ObserverComponent as React.ComponentType<P>;
  };
};
