import { ReactiveEngine } from './core';

export abstract class BaseREServiceEnhanced {
  constructor(protected engine: ReactiveEngine) {
    setTimeout(() => this.onInit(), 0)
  }

  protected onInit(): void { }
}
