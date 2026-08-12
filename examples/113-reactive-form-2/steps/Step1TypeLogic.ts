import { AbstractService } from '@pravosleva/reactive-engine'

export interface Step1Fields {
  appealType: string;
  ticketTitle: string;
}

export interface Step1Fields {
  appealType: string;
  ticketTitle: string;
}

export class Step1TypeLogic extends AbstractService {
  public fields = this.engine.reactive<Step1Fields>({
    appealType: '',
    ticketTitle: ''
  }, 'example-113:step1-fields')

  // Это чистая синхронная функция-валидатор! Нет разрыва графа.
  public checkIsValid(): { isValid: boolean; message: string | null } {
    const type = this.fields.appealType
    const title = this.fields.ticketTitle.trim()
    if (!type) return { isValid: false, message: 'Выберите тип обращения' }
    if (!title) return { isValid: false, message: 'Введите тему обращения' }
    if (title.length < 5) return { isValid: false, message: 'Тема должна быть не менее 5 символов' }
    return { isValid: true, message: null }
  }

  public clear() {
    this.fields.appealType = ''
    this.fields.ticketTitle = ''
  }
}
