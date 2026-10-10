import { ReactiveEngineAutomatic } from './core.automatic'

export abstract class BaseREServiceEnhanced {
  constructor(protected engine: ReactiveEngineAutomatic) {
    setTimeout(() => this.onInit(), 0)
  }

  protected onInit(): void { }
}
