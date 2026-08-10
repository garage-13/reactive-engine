import { signal, inject, DestroyRef, Injector, runInInjectionContext, type Signal } from '@angular/core';
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core';

// Описываем интерфейс опций для Angular-адаптера
export interface AngularUseOptions {
  /**
   * Кастомный инжектор Angular.
   * Позволяет использовать .use() вне конструктора (например, в асинхронных функциях),
   * если передать текущий Injector вручную.
   */
  injector?: Injector;
}

export class ReactiveEngine4Angular extends OriginalReactiveEngine {
  protected override frameworkPrefix = 'angular';

  /**
   * Использование реактивного значения в Angular компоненте или сервисе.
   * Возвращает стандартный Angular Signal.
   */
  public use<T>(
    item: { value: T; subscribe: (cb: (v: T) => void) => CleanupFn },
    options?: AngularUseOptions
  ): Signal<T> {
    // 1. Создаем локальный Angular Signal со стартовым значением
    const angularSignal = signal<T>(item.value);

    // 2. Подписываемся на изменения сигнала вашего ядра
    const unsubscribe = item.subscribe(() => {
      // Принудительно дергаем геттер .value, чтобы запустить Pull-вычисление ядра
      // и получить свежие данные, попутно запустив профайлер логгера computed!
      const freshValue = item.value;
      angularSignal.set(freshValue);
    });

    // 3. Логика автоматической отписки через DestroyRef
    const registerCleanup = () => {
      const destroyRef = inject(DestroyRef);
      destroyRef.onDestroy(() => {
        unsubscribe();
      });
    };

    // 4. Если пользователь явно передал кастомный инжектор — выполняем регистрацию внутри его контекста
    if (options?.injector) {
      runInInjectionContext(options.injector, registerCleanup);
    } else {
      // Иначе штатно выполняем в текущем контексте (вызовет ошибку NG0203, если контекст не валиден)
      registerCleanup();
    }

    return angularSignal.asReadonly();
  }
}
