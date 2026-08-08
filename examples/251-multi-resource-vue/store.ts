// store.ts
import { UserInfoService } from '../201-multi-resource/service.firstly'
import { SecondaryService } from '../201-multi-resource/service.secondary'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'

// Инициализируем Vue-версию движка
export const vueEngine = new ReactiveEngine4Vue()

// Экспортируем хуки для получения инстансов из DI-контейнера
export const useUserInfoService = () => vueEngine.inject(UserInfoService)
export const useSecondaryService = () => vueEngine.inject(SecondaryService)
