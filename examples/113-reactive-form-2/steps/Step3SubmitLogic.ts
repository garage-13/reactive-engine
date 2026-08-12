import { AbstractService } from '@pravosleva/reactive-engine'

export interface Step3Fields {
  description: string;
  agreeToTerms: boolean;
}

export class Step3SubmitLogic extends AbstractService {
  public fields = this.engine.reactive<Step3Fields>({
    description: '',
    agreeToTerms: false
  }, 'example-113:step3-fields')

  public checkIsValid(): { isValid: boolean; message: string | null } {
    const desc = this.fields.description.trim()
    const agree = this.fields.agreeToTerms
    if (!desc) return { isValid: false, message: 'Описание обязательно для заполнения' }
    if (desc.length < 10) return { isValid: false, message: 'Описание должно быть от 10 символов' }
    if (!agree) return { isValid: false, message: 'Необходимо согласиться с условиями обработки данных' }
    return { isValid: true, message: null }
  }

  public clear() {
    this.fields.description = ''
    this.fields.agreeToTerms = false
  }
}
