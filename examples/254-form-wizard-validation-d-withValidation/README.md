## Как правильно работать с движком в React?
Канонический, производительный и чистый способ, который на 100% дружит с React, не ломает его философию и не порождает рекурсий в ядре — это точечные подписки на уровне полей.

Чтобы убрать «портянки» из кода компонента, в индустрии используется два паттерна:

### Паттерн 1: Вынесение геттеров в Сервис (Computed Снимок Шага)

Вместо того чтобы подписывать компонент на весь стейт формы, ваш сервис FormWizardLogic должен отдавать ленивые computed-снимки строго для текущего активного шага. Компонент подписывается ровно на один шаг:

```
// В компоненте React остаётся всего две чистые подписки!
const step = use(logic.currentStep)
const account = use(logic.currentAccountFields) // computed-срез данных первого шага
```

### Паттерн 2: Извлечение значений (Unwrapping) на уровне инпутов

Если полей действительно много, компонент верхнего уровня вообще не должен делать use(). Он просто рендерит дочерние инпуты, и каждый инпут самостоятельно подписывается строго на свой сигнал. Ререндериться будет один инпут из ста, обеспечивая космический перформанс:

```
// Сверхпроизводительный точечный инпут
const EmailInput = ({ logic }) => {
  const email = use(logic.emailSignal)
  return (
    <input value={email} onChange={e => logic.setEmail(e.target.value)} />
  )
}
```

#### Код родительского компонента для этого примера:
```tsx
import React from 'react'
import { ReactiveEngine, use } from '@pravosleva/reactive-engine/react'
import { FormWizardLogic } from './service.FormWizardLogic'

// 1. Инициализируем движок и вытаскиваем логику из DI-контейнера
const engine = new ReactiveEngine()

// 2. Изолированный дочерний инпут Email
const EmailInput = ({ logic }: { logic: FormWizardLogic }) => {
  // Точечная подписка: ререндерится ТОЛЬКО этот инпут при вводе
  const email = use(logic.formData.account.emailSignal) 
  const error = use(logic.errors).email

  return (
    <div className="stack">
      <input
        value={email}
        onChange={(e) => {
          logic.formData.account.emailSignal.value = e.target.value
          if (error) logic.clearError('email')
        }}
        placeholder="Email"
        className="inputMin"
      />
      {error && <span style={{ color: 'red', fontSize: '12px' }}>{error}</span>}
    </div>
  )
}

// 3. Изолированный дочерний инпут Телефона
const PhoneInput = ({ logic }: { logic: FormWizardLogic }) => {
  const phone = use(logic.formData.account.phoneSignal)
  const error = use(logic.errors).phone

  return (
    <div className="stack">
      <input
        value={phone}
        onChange={(e) => {
          logic.formData.account.phoneSignal.value = e.target.value.replace(/\D/g, '')
          if (error) logic.clearError('phone')
        }}
        placeholder="Телефон (только цифры)"
        className="inputMin"
      />
      {error && <span style={{ color: 'red', fontSize: '12px' }}>{error}</span>}
    </div>
  )
}

// 🌟 УЛЬТИМАТИВНЫЙ РОДИТЕЛЬСКИЙ КОМПОНЕНТ
export const WizardFormParent = () => {
  const logic = engine.inject(FormWizardLogic)

  // Родитель подписывается ТОЛЬКО на смену шагов и статус отправки ресурса
  const step = use(logic.currentStep)
  const submitState = use(logic.submitWizardForm)
  const isFormValid = use(logic.isWizardValid)

  return (
    <div className="unit stack2" style={{ padding: '24px', maxWidth: '500px' }}>
      <div className="absoluteUnitLabel">Example 256: Ultra-Performance Segmented Inputs</div>

      {/* ШАГ 1: Аккаунт */}
      {step === 1 && (
        <div className="stack2">
          <h3>Шаг 1: Настройки аккаунта</h3>
          
          {/* Передаем сервис вниз. Пропсы стабильны, родитель не ререндерится при вводе букв */}
          <EmailInput logic={logic} />
          <PhoneInput logic={logic} />

          {/* проброс инстанса logic не требует абсолютно никакой дополнительной мемоизации
          (вроде React.memo для дочернего инпута или оборачивания сервиса в useMemo),
          и вот почему это архитектурно безопасно, даже если родительский компонент внезапно обновится.
          */}

          <button onClick={logic.nextToProfileStep} className="btn neonBtn neonBtn--primary neonBtn--contained">
            Далее
          </button>
        </div>
      )}

      {/* ШАГ 2: Личные данные */}
      {step === 2 && (
        <div className="stack2">
          <h3>Шаг 2: Личные данные</h3>
          
          <input
            value={use(logic.formData.profile.firstNameSignal)}
            onChange={(e) => (logic.formData.profile.firstNameSignal.value = e.target.value)}
            placeholder="Имя"
            className="inputMin"
          />

          <input
            value={use(logic.formData.profile.lastNameSignal)}
            onChange={(e) => (logic.formData.profile.lastNameSignal.value = e.target.value)}
            placeholder="Фамилия"
            className="inputMin"
          />

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
        {submitState.data?.success && <div style={{ color: 'green', marginTop: '8px' }}>🎉 Успешно отправлено!</div>}
      </div>
    </div>
  )
}
```
