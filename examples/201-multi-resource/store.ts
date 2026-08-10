import { UserInfoService } from './service.firstly'
import { SecondaryService } from './service.secondary'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true, // Включаем логгер
    traceTime: true, // Добавляем вывод таймингов по желанию
    filter: /^example-201:*/ // Можно фильтровать только нужные логи
  }
})

export const useUserInfoService = () => engine.inject(UserInfoService)
export const useSecondaryService = () => engine.inject(SecondaryService)

export { engine }
