import { AbstractService } from '../../src/core'
import { withValidation, withResourceValidation, ValidationSchema } from '../../src/decorators'

export interface WizardState {
  step: number
  account: { email: string; phone: string }
  profile: { firstName: string; lastName: string }
}

export class ApiService {
  public async submitWizard(data: WizardState['profile']) {
    return new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
  }
}

export class FormWizardLogic extends AbstractService {
  private api = this.engine.inject(ApiService)

  public currentStep = this.createSignal<number>(1, 'wizard:step')
  public errors = this.createSignal<Record<string, string>>({}, 'wizard:errors')

  public formData = this.engine.reactive<WizardState>({
    step: 1,
    account: { email: '', phone: '' },
    profile: { firstName: '', lastName: '' }
  }, 'wizard:form-data')

  // ПРАВИЛЬНАЯ ВАЛИДАЦИЯ: Строгая проверка email и телефона на уровне бизнес-логики
  private accountSchema: ValidationSchema<WizardState['account']> = {
    email: (val) => {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      return emailRegex.test(val) ? true : 'Введите корректный email (например, user@mail.com)'
    },
    phone: (val) => val.length >= 10 ? true : 'Телефон должен содержать не менее 10 цифр'
  }

  private profileSchema: ValidationSchema<WizardState['profile']> = {
    firstName: (val) => val.trim() ? true : 'Имя обязательно',
    lastName: (val) => val.trim() ? true : 'Фамилия обязательна'
  }

  public isWizardValid = this.engine.computed<boolean>(() => {
    const { email, phone } = this.formData.account
    const { firstName, lastName } = this.formData.profile
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(email) && phone.length >= 10 && !!firstName.trim() && !!lastName.trim()
  }, 'wizard:computed:is-valid')

  private profileSource = this.engine.computed(() => this.formData.profile)

  public nextToProfileStep = () => {
    const action = withValidation(() => {
      this.currentStep.value = 2
    }, { schema: this.accountSchema, errorsSignal: this.errors })
    
    action(this.formData.account)
  }

  public submitWizardForm = this.engine.resource(
    withResourceValidation(
      async (profileData, abortSignal) => {
        return this.api.submitWizard(profileData) as Promise<{ success: boolean }>
      },
      { schema: this.profileSchema, errorsSignal: this.errors }
    ),
    this.profileSource,
    { name: 'wizard:resource:submit' }
  )

  public prevStep = () => {
    this.errors.value = {}
    this.currentStep.value = 1
  }
}
