import { ReactiveEngineCore } from './core'

export abstract class BaseREServiceEnhanced {
  constructor(protected engine: ReactiveEngineCore) {
    setTimeout(() => this.onInit(), 0)
  }

  protected onInit(): void { }
}
