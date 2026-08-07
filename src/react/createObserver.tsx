import React, { useSyncExternalStore, useMemo, useEffect, useRef } from 'react'
import { ReactiveEngine } from '../core'

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

interface TriggerProps {
  engine: ReactiveEngine;
  Component: React.ComponentType<any>;
  props: any;
  onTrigger: () => void;
}

/**
 * Вспомогательный компонент, изолирующий выполнение пользовательского компонента
 * от функции safeRun движка во время сбора реактивных зависимостей.
 */
const ReactiveRenderTrigger = ({ engine, Component, props, onTrigger }: TriggerProps) => {
  let renderedElement: React.ReactNode = null;

  // 1. Создаем эффект движка. Он инициализируется пустым, чтобы не оборачивать
  // вызов компонента в safeRun и не ломать правила хуков React.
  const unsub = engine.effect(() => {
    // Этот коллбек сработает, когда изменятся сигналы, считанные в JSX ниже
    onTrigger();
  });

  // Преобразуем инстанс движка в any, чтобы достучаться до внутренних (private/protected) свойств
  const enginePrivate = engine as any;

  // 2. Извлекаем объект созданного эффекта из внутренней коллекции движка.
  // Если у вас свойство называется иначе, проверьте имя в коде: this.allEffects.add(effectObj);
  const allEffectsArray = Array.from(enginePrivate.allEffects || []);
  const currentEffectObj = allEffectsArray[allEffectsArray.length - 1];

  // Определяем точное имя свойства активного эффекта.
  // Если в коде класса оно написано как activeEffect, то используем его через any.
  const activeEffectKey = 'activeEffect' in enginePrivate ? 'activeEffect' : '_activeEffect';

  const prevActive = enginePrivate[activeEffectKey];
  enginePrivate[activeEffectKey] = currentEffectObj;

  try {
    // 3. Вызываем компонент напрямую в экосистеме React.
    // Все внутренние хуки (useEffect, useRef) теперь работают штатно.
    if (typeof Component === 'function' && !Component.prototype?.isReactComponent) {
      renderedElement = (Component as Function)(props);
    } else {
      renderedElement = React.createElement(Component, props);
    }
  } finally {
    // 4. Возвращаем движок в исходное состояние и подчищаем временный эффект
    enginePrivate[activeEffectKey] = prevActive;
    unsub();
  }

  return renderedElement;
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
 * import { createObserver } from '@pravosleva/reactive-engine';
 * import { engine } from '~/utils/ReactiveEngine'; // Ваш локальный экземпляр движка
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
  return <P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> => {

    const ObserverComponent = (props: P) => {
      const versionRef = useRef(0);
      const enginePrivate = engine as any;

      // Опеределяем внутреннее имя свойства активного эффекта в вашем движке
      const activeEffectKey = 'activeEffect' in enginePrivate ? 'activeEffect' : '_activeEffect';

      // Хранилище для инстанса долгоживущего эффекта движка
      const effectObjRef = useRef<any>(null);

      // Интеграция с подписками React 18+ через useSyncExternalStore
      const { subscribe, getSnapshot } = useMemo(() => {
        return {
          subscribe: (onStoreChange: () => void) => {
            // Создаем ОДИН долгоживущий эффект на весь жизненный цикл компонента.
            // Он уничтожится только тогда, когда React размонтирует компонент.
            const unsub = engine.effect(() => {
              // При изменении сигналов инкрементируем версию и уведомляем React
              versionRef.current++;
              onStoreChange();
            });

            // Нам нужно получить объект этого эффекта.
            // Из вашего кода метода `effect`: эффект добавляется в `this.allEffects.add(effectObj)`.
            const allEffectsArray = Array.from(enginePrivate.allEffects || []);
            effectObjRef.current = allEffectsArray[allEffectsArray.length - 1];

            return () => {
              unsub(); // Чистим эффект при размонтировании
              effectObjRef.current = null;
            };
          },
          getSnapshot: () => versionRef.current
        };
      }, []);

      // Подписываем компонент. React сам управляет вызовами subscribe/unsubscribe в StrictMode.
      useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      // --- ФАЗА СБОРА ЗАВИСИМОСТЕЙ ---
      // Если эффект уже создан (компонент смонтирован), мы временно подставляем его в движок.
      // Если это самый первый рендер (эффекта еще нет в subscribe), мы берем временный "заглушечный"
      // объект эффекта, чтобы движок не упал, а сигналы зарегистрировали чтение.
      const fallbackEffect = { cleanups: new Set(), run: () => { } };
      const currentEffect = effectObjRef.current || fallbackEffect;

      // Перед рендером подменяем активный эффект
      const prevActive = enginePrivate[activeEffectKey];
      enginePrivate[activeEffectKey] = currentEffect;

      let renderedElement: React.ReactNode = null;
      try {
        // Вызываем компонент напрямую. Хуки типа useEffect работают идеально,
        // так как они не обернуты в safeRun движка.
        if (typeof Component === 'function' && !Component.prototype?.isReactComponent) {
          renderedElement = (Component as Function)(props);
        } else {
          renderedElement = React.createElement(Component, props);
        }
      } finally {
        // После рендера возвращаем исходное состояние движка
        enginePrivate[activeEffectKey] = prevActive;
      }

      return renderedElement;
    };

    ObserverComponent.displayName = `Observer(${Component.displayName || Component.name || 'Component'})`;
    return ObserverComponent as React.ComponentType<P>;
  };
};
