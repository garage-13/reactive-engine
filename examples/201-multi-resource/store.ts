import { UserInfoService } from './service.firstly'
import { SecondaryService } from './service.secondary'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

const engine = new ReactiveEngine()

export const useUserInfoService = () => engine.inject(UserInfoService)
export const useSecondaryService = () => engine.inject(SecondaryService)

export { engine }
