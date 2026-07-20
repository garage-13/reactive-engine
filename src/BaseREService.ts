import { ReactiveEngine } from './core';

export abstract class AbstractService {
  constructor(protected engine: ReactiveEngine) {
    // Вызываем метод инициализации, который можно переопределить в наследниках
    this.onInit();
  }

  // NOTE: Полезные хелперы для сокращения кода
  protected createNumericSignal(val: number, name: string) {
    return this.engine.signal(val, {
      name,
      validate: (v) => typeof v === 'number' && !isNaN(v)
    });
  }

  protected createComputed<T>(fn: () => T) {
    return this.engine.computed(fn);
  }

  protected createSignal<T>(val: T, name?: string) {
    return this.engine.signal(val, name);
  }

  // NOTE: Жизненный цикл: вызывается сразу после создания сервиса.
  // Удобно для инициализации сигналов, которые зависят от engine.
  protected onInit(): void { }
}

export const BaseREService = AbstractService
