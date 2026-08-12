import { AbstractService } from '@pravosleva/reactive-engine'
import { FileSelectionService } from './service.FileSelectionService'

export class Step2FilesLogic extends AbstractService {
  // Наш проверенный файловый менеджер из прошлого шага
  public fileManager = this.engine.inject(FileSelectionService)

  public checkIsValid(): { isValid: boolean; message: string | null } {
    const state = this.fileManager.state
    if (state.globalStatus === 'error' || state.errorMessage) {
      return { isValid: false, message: state.errorMessage || 'Ошибка файловой системы' }
    }
    if (state.items.length === 0) {
      return { isValid: false, message: 'Прикрепите хотя бы один документ' }
    }
    if (state.globalStatus !== 'ready') {
      return { isValid: false, message: 'Дождитесь окончания загрузки всех файлов' }
    }
    return { isValid: true, message: null }
  }

  public clear() {
    this.fileManager.clear()
  }
}
