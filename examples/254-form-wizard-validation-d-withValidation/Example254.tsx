import { ReactiveEngine, use } from '@pravosleva/reactive-engine/react'
import { FormWizardLogic } from './service.FormWizardLogic'

const engine = new ReactiveEngine({ logger: { isEnabled: true } })

export const Example254 = () => {
  const logic = engine.inject(FormWizardLogic)

  const step = use(logic.currentStep)
  const errors = use(logic.errors)
  const isFormValid = use(logic.isWizardValid)
  const submitState = use(logic.submitWizardForm)
  const form = use(logic.formData)

  return (
    <div className="unit stack2" style={{ padding: '24px', maxWidth: '500px' }}>
      <div className="absoluteUnitLabel">Example 254: High-Performance Form Wizard</div>

      {/* ШАГ 1: Аккаунт */}
      {step === 1 && (
        <div className="stack2">
          <h3>Шаг 1: Настройки аккаунта</h3>
          
          <input
            value={form.account.email}
            onChange={(e) => {
              logic.formData.account.email = e.target.value
              if (errors.email) logic.errors.value = { ...errors, email: '' } // Мягкий сброс ошибки при вводе
            }}
            placeholder="Email (user@mail.com)"
            className="inputMin"
          />
          {errors.email && <span style={{ color: 'red', fontSize: '12px' }}>{errors.email}</span>}

          <input
            value={form.account.phone}
            onChange={(e) => {
              // ИСПРАВЛЕНО: Вырезаем любые нецифровые символы на лету (Sanitization)
              const cleanDigits = e.target.value.replace(/\D/g, '')
              logic.formData.account.phone = cleanDigits
              if (errors.phone) logic.errors.value = { ...errors, phone: '' }
            }}
            placeholder="Телефон (только цифры)"
            className="inputMin"
          />
          {errors.phone && <span style={{ color: 'red', fontSize: '12px' }}>{errors.phone}</span>}

          <button onClick={logic.nextToProfileStep} className="btn neonBtn neonBtn--primary neonBtn--contained">
            Далее
          </button>
        </div>
      )}

      {/* ШАГ 2: Профиль */}
      {step === 2 && (
        <div className="stack2">
          <h3>Шаг 2: Личные данные</h3>
          
          <input
            value={form.profile.firstName}
            onChange={(e) => {
              logic.formData.profile.firstName = e.target.value
              if (errors.firstName) logic.errors.value = { ...errors, firstName: '' }
            }}
            placeholder="Имя"
            className="inputMin"
          />
          {errors.firstName && <span style={{ color: 'red', fontSize: '12px' }}>{errors.firstName}</span>}

          <input
            value={form.profile.lastName}
            onChange={(e) => {
              logic.formData.profile.lastName = e.target.value
              if (errors.lastName) logic.errors.value = { ...errors, lastName: '' }
            }}
            placeholder="Фамилия"
            className="inputMin"
          />
          {errors.lastName && <span style={{ color: 'red', fontSize: '12px' }}>{errors.lastName}</span>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={logic.prevStep} className="btn neonBtn neonBtn--outlined">
              Назад
            </button>
            <button 
              onClick={() => logic.submitWizardForm.refetch()} 
              disabled={submitState.loading}
              className="btn neonBtn neonBtn--secondary neonBtn--contained"
            >
              {submitState.loading ? 'Отправка...' : 'Завершить'}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
        <div>Валидность всей формы (Computed): {isFormValid ? '🟢 Готова' : '🔴 Заполните все поля'}</div>
        {submitState.data?.success && <div style={{ color: 'green', marginTop: '8px' }}>🎉 Форма успешно отправлена через DI ApiService!</div>}
      </div>
    </div>
  )
}
