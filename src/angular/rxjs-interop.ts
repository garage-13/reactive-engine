import { Observable, Subscribable, Unsubscribable } from 'rxjs';
import { CleanupFn } from '../core/core';

/**
 * Контракт любого реактивного элемента вашего ядра (Signal, Computed, Resource)
 */
interface CoreReactiveItem<T> {
  value: T;
  subscribe(cb: (val: T) => void): CleanupFn;
}

/**
 * УТИЛИТА 1: Переводит элемент вашего ядра (Signal/Computed) в RxJS поток Observable.
 * Позволяет применять к стейту ядра мощные операторы RxJS (debounceTime, switchMap и др.).
 */
export const coreToObservable = <T>(item: CoreReactiveItem<T>): Observable<T> => {
  return new Observable<T>((subscriber) => {
    // 1. Мгновенно пушим текущее стартовое значение в поток (BehaviorSubject-style)
    subscriber.next(item.value);

    // 2. Подписываемся на изменения в вашем ядре.
    // Благодаря нашему frameworkPrefix в логах отобразится "angular:use:..."
    const unsubscribe = item.subscribe(() => {
      // Принудительно запрашиваем .value, защищая Pull-модель computed от замерзания
      subscriber.next(item.value);
    });

    // 3. Возвращаем деструктор отписки для RxJS
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  });
};

/**
 * УТИЛИТА 2: Принимает RxJS Observable и возвращает объект подписки,
 * совместимый по контракту с методом engine.use() вашего адаптера.
 */
export const coreFromObservable = <T>(
  source$: Observable<T>,
  initialValue: T
): CoreReactiveItem<T> => {
  let currentValue = initialValue;

  return {
    get value() {
      return currentValue;
    },
    subscribe(cb: (val: T) => void) {
      // Подписываемся на RxJS поток
      const subscription = source$.subscribe((newValue) => {
        currentValue = newValue;
        cb(newValue);
      });

      // Возвращаем CleanupFn для вашего ядра
      return () => subscription.unsubscribe();
    }
  };
};
