import { ReactiveEngine } from './core';

// export abstract class BaseService {
//   constructor(protected engine: ReactiveEngine) {
//     // Вызываем метод инициализации, который можно переопределить в наследниках
//     this.onInit();
//   }

//   // NOTE: Жизненный цикл: вызывается сразу после создания сервиса.
//   // Удобно для инициализации сигналов, которые зависят от engine.
//   protected onInit(): void {}

//   // NOTE: Полезные хелперы для сокращения кода
//   protected createSignal<T>(val: T, name?: string) {
//     return this.engine.signal(val, name);
//   }

//   protected createComputed<T>(fn: () => T) {
//     return this.engine.computed(fn);
//   }
// }

export abstract class BaseREService {
  constructor(protected engine: ReactiveEngine) { } // Просто сохраняем engine

  protected createNumericSignal(val: number, name: string) {
    return this.engine.signal(val, {
      name,
      validate: (v) => typeof v === 'number' && !isNaN(v)
    });
  }
}
