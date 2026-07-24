import { useEffect } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import { MultiStepFormLogic } from './service.MultiStepFormLogic'
import { Input } from '~/shared/Input'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const MultiStepFormExample = () => {
  const logic = engine.inject(MultiStepFormLogic)

  // 1. ПОДПИСКИ НА СИГНАЛЫ ФОРМЫ
  const currentStep = engine.use(logic.step)
  const username = engine.use(logic.username)
  const email = engine.use(logic.email)
  const agreeToTerms = engine.use(logic.agreeToTerms)

  // 2. ПОДПИСКИ НА ИНФРАСТРУКТУРУ И СЕРВЕРНЫЕ ЛОГИ ИЗ ДОЧЕРНЕГО СЕРВИСА
  const serverLogs = engine.use(logic.history.serverLogs)
  const { loading: isSyncing } = useReactiveValue(logic.history.syncResource)

  // 3. ПОДПИСКИ НА COMPUTED ВАЛИДАТОРЫ
  const isStep1Valid = engine.use(logic.isStep1Valid)
  const isStep2Valid = engine.use(logic.isStep2Valid)
  const isStep3Valid = engine.use(logic.isStep3Valid)
  const canUndo = engine.use(logic.canUndo)

  // Инициализируем форму из кэша при первом монтировании
  useEffect(() => {
    logic.initializeForm()
    return () => logic.destroy()
  }, [logic])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui', width: '600px' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Multi-Step Form (DI + Undo + Cache)</div>

      {/* Индикатор текущего шага */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'small' }}>
        <b>Шаг {currentStep} из 3</b>
        <span style={{ color: '#aaa', fontWeight: 'bold' }}>
          {currentStep === 1 ? 'Личные данные' : currentStep === 2 ? 'Контакты' : 'Подтверждение'}
        </span>
      </div>

      {/* Отрисовка шагов формы на основе стейта */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {currentStep === 1 && (
          <div className={baseClasses.stack1} style={{ width: '100%' }}>
            <label style={{ fontSize: 'small' }}>Введите ваше имя (минимум 2 символа):</label>
            <Input
              type="text"
              placeholder="Имя..."
              value={username}
              onChange={(e) => logic.updateUsername(e.target.value)}
            />
          </div>
        )}

        {currentStep === 2 && (
          <div className={baseClasses.stack1} style={{ width: '100%' }}>
            <label style={{ fontSize: 'small' }}>Укажите валидный Email:</label>
            <Input
              type="email"
              placeholder="example@mail.com"
              value={email}
              onChange={(e) => logic.updateEmail(e.target.value)}
            />
          </div>
        )}

        {currentStep === 3 && (
          <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={agreeToTerms}
              onChange={(e) => logic.updateAgreement(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>Я согласен с условиями лицензионного договора</span>
          </label>
        )}
      </div>

      {/* Панель навигации по шагам */}
      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
        {currentStep > 1 && (
          <button
            onClick={() => logic.prevStep()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
            style={{ flex: 1 }}
          >
            Назад
          </button>
        )}

        {currentStep < 3 ? (
          <button
            disabled={(currentStep === 1 && !isStep1Valid) || (currentStep === 2 && !isStep2Valid)}
            onClick={() => logic.nextStep()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
            style={{ flex: 1 }}
          >
            Вперед
          </button>
        ) : (
          <button
            disabled={!isStep3Valid}
            onClick={() => alert('Форма успешно отправлена!')}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
            style={{ flex: 1 }}
          >
            Отправить форму
          </button>
        )}
      </div>

      {/* Инфраструктурная панель: Откат (Undo) и Очистка */}
      <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
        <button
          disabled={!canUndo}
          onClick={() => logic.undo()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
          style={{ flex: 2 }}
        >
          ↩️ Откатить шаг (Undo)
        </button>
        <button
          onClick={() => logic.resetForm()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--danger'], btnClasses['neonBtn--outlined'])}
          style={{ flex: 1 }}
        >
          Сбросить кэш
        </button>
      </div>

      {/* Терминал логов бэкенда */}
      <div className={baseClasses.stack1} style={{ width: '100%' }}>
        <div style={{ fontSize: 'small', display: 'flex', justifyContent: 'space-between' }}>
          <span>Сетевая синхронизация формы:</span>
          {isSyncing && <span style={{ color: '#e6af2e' }}>⏳ Синхронизация...</span>}
        </div>
        <div style={{ background: '#111', height: '110px', borderRadius: '6px', padding: '10px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {serverLogs.length === 0 ? (
            <span>Заполните поля для начала логирования...</span>
          ) : (
            serverLogs.map((log, index) => (
              <div key={index} style={{ color: log.startsWith('🟢') ? '#4caf50' : '#ffb74d' }}>{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
