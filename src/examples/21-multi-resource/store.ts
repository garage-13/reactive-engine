import { UserInfoService } from './service.firstly'
import { SecondaryService } from './service.secondary'
import { ReactiveEngine } from '../../core'
import { createObserver } from '../../decorators'

const engine = new ReactiveEngine()

export const useUserInfoService = () => engine.inject(UserInfoService)
export const useSecondaryService = () => engine.inject(SecondaryService)

const observer = createObserver(engine)

export { engine, observer }
