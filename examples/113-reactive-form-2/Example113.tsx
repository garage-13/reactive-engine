import { ChangeEvent, useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/react'
import { FormUploaderLogic } from './service.FormUploaderLogic'
import clsx from 'clsx'
import { Input, Select, Textarea } from '~/shared'

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: false,
    filter: /^example-113:.*/
  }
})

export const Example113 = () => {
  const logic = engine.inject(FormUploaderLogic)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Увеличивается синхронно на каждый кадр выполнения функции React
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  console.log(`🖥️ [React Render] Кадр №${renderCountRef.current}`)

  // Мастер-подписка на стейт-машину формы
  const form = engine.use(logic.uiBridge)
  // Подписка на асинхронный статус сетевой отправки
  const { loading: isSubmitting, error: submitError } = useReactiveValue(logic.submitResource)

  useEffect(() => {
    return () => logic.destroy()
  }, [logic])

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)} style={{ width: '600px', fontFamily: 'system-ui' }}>
      <div className={baseClasses.absoluteUnitLabel}>Wizard State-Machine Form</div>

      {/* ПАНЕЛЬ ТЕЛЕМЕТРИИ REAСT: Выводим количество чистых рендеров */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a24', padding: '8px', borderRadius: '8px', border: '1px solid #252530', fontSize: 'small', fontFamily: 'monospace' }}>
        <span style={{ color: '#aaa' }}>Телеметрия UI-слоя</span>
        <span style={{ color: '#42b883', fontWeight: 'bold' }}>
          Рендеров компонента: <span style={{ color: '#00b4d8', fontSize: '13px' }}>{renderCountRef.current}</span>
        </span>
      </div>

      {/* Верхний статус успеха (если форма была отправлена ранее) */}
      {form.successMessage && (
        <div style={{ color: '#42b883', fontSize: '12px', background: 'rgba(66,184,131,0.1)', padding: '10px', borderRadius: '8px', textAlign: 'center', fontFamily: 'monospace' }}>
          🎉 {form.successMessage}
        </div>
      )}

      {/* ШАГ 1/3: Выбор типа обращения */}
      {form.currentStep === 'TYPE' && (
        <div className={baseClasses.stack2}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#00b4d8' }}>Шаг 1/3: Выберите тип обращения</div>

          <div className={baseClasses.stack1}>
            <label style={{ fontSize: 'small' }}>Категория:</label>
            <Select
              value={form.appealType}
              onChange={(e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => logic.setAppealType(e.target.value)}
              variant="outlined"       // или "contained"
              colorType="primary"      // или "secondary"
            >
              {/* Если нужен пустой первый пункт (unselected state) как в MUI: */}
              {/* <option value="" disabled hidden></option> */}

              <option value="">-- Выберите из списка --</option>
              <option value="tech">Техническая поддержка GPU</option>
              <option value="billing">Вопросы по оплате и биллингу</option>
              <option value="legal">Юридические документы</option>
            </Select>
          </div>

          <div className={baseClasses.stack1}>
            <label style={{ fontSize: 'small' }}>Тема обращения:</label>
            <Input
              type="text"
              placeholder="Введите текст"
              value={form.ticketTitle}
              onChange={(e) => logic.setTicketTitle(e.target.value)}
            />
          </div>
          {form.step1Error && <span style={{ color: 'orange', fontSize: 'small', fontFamily: 'monospace' }}>⚠️ {form.step1Error}</span>}
        </div>
      )}

      {/* ШАГ 2/3: Прикрепление пакета документов */}
      {form.currentStep === 'FILES' && (
        <div className={baseClasses.stack2}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', color: '#00b4d8' }}>
            <span>Шаг 2/3: Приложите пакет документов</span>
            <span style={{ color: '#aaa' }}>Объем: {form.totalSizeStr}</span>
          </div>

          <input type="file" ref={fileInputRef} multiple onChange={(e) => logic.step2.fileManager.selectFiles(e.target.files)} style={{ display: 'none' }} />

          {form.fileSystemError && <div style={{ color: '#ff4a4a', fontSize: 'small', background: 'rgba(255,74,74,0.05)', padding: '8px', borderRadius: '8px' }}>⚠️ {form.fileSystemError}</div>}

          <div className={baseClasses.stack1}>
            {form.files.length === 0 && <div style={{ color: 'gray', fontSize: 'small', background: 'rgba(0,0,0,0.05)', padding: '8px', borderRadius: '8px' }}>
              Файлы не выбраны. Воспользуйтесь кнопкой «Прикрепить» ниже.
            </div>}
            {form.files.map(file => (
              <div
                key={file.id}
                style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  background: '#191922',
                  padding: '8px',
                  borderRadius: '8px',
                  // border: '1px solid #282835',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px', color: '#eee', fontWeight: 'bold' }}>
                    📄 {file.name} ({file.sizeStr})
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      color: file.status === 'SUCCESS' ? '#42b883' : file.status === 'LOADING' ? '#007acc' : file.status === 'ERROR' ? '#ff4a4a' : '#aaa',
                      fontWeight: 'bold'
                    }}>
                      {file.status === 'LOADING' && '⏳ LOADING...'}
                      {file.status === 'SUCCESS' && '🟢 OK (ok: true)'}
                      {file.status === 'ERROR' && '🔴 REJECTED'}
                      {file.status === 'PENDING' && '⚪ PENDING'}
                    </span>

                    <button
                      onClick={() => logic.removeFile(file.id)}
                      disabled={isSubmitting}
                      style={{
                        background: 'none', border: 'none', color: '#ff4a4a', cursor: 'pointer',
                        fontSize: '11px', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace',
                        opacity: isSubmitting ? 0.4 : 1, transition: 'opacity 0.2s'
                      }}
                      title="Удалить файл и прервать запрос"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,74,74,0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Выводим текст ошибки валидации ответа validateResponse, если файл отклонен бэкендом */}
                {file.status === 'ERROR' && (
                  <div style={{ color: '#ff4a4a', fontSize: '10px', marginTop: '2px' }}>
                    ❌ {file.errorMessage || 'Ошибка сети или сбой валидации поля ok'}
                  </div>
                )}
              </div>
            ))}
          </div>
          {form.step1Error && <span style={{ color: 'orange', fontSize: 'small', fontFamily: 'monospace' }}>⚠️ {form.step1Error}</span>}
        </div>
      )}

      {/* ШАГ 3/3: Отправка формы */}
      {form.currentStep === 'SUBMIT' && (
        <div className={baseClasses.stack2}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#00b4d8' }}>Шаг 3/3: Детальное описание и отправка</div>

          <div className={baseClasses.stack1}>
            <label style={{ fontSize: 'small' }}>Подробное описание:</label>
            <Textarea
              value={form.description}
              onChange={(e) => logic.setDescription(e.target.value)}
              placeholder="Опишите ситуацию развернуто..."
              rows={3}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', fontSize: '13px', minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={form.agreeToTerms}
              onChange={(e) => logic.setAgreeToTerms(e.target.checked)}
              id="agree-checkbox"
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="agree-checkbox" style={{ cursor: 'pointer' }}>Я согласен с политикой обработки персональных данных</label>
          </div>
          {form.step3Error && <span style={{ color: 'orange', fontSize: 'small', fontFamily: 'monospace' }}>⚠️ {form.step3Error}</span>}
        </div>
      )}

      {/* ШАГ УСПЕХА API (Выделенная страница триумфа) 🟢 */}
      {form.currentStep === 'SUCCESS_PAGE' && (
        <div style={{ padding: '24px', background: 'rgba(66,184,131,0.05)', border: '1px solid #42b883', borderRadius: '8px', textAlign: 'center' }} className={baseClasses.stack2}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#42b883' }}>🎉 Пакет документов успешно принят!</div>
          <code>
            {form.successMessage}
          </code>
        </div>
      )}

      {/* ШАГ ОШИБКИ API (Страница сбоя) 🔴 */}
      {form.currentStep === 'ERROR_PAGE' && (
        <div style={{ padding: '24px', background: 'rgba(255,74,74,0.05)', border: '1px solid #ff4a4a', borderRadius: '8px', textAlign: 'center' }} className={baseClasses.stack2}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4a4a' }}>🚨 Произошел критический сбой API</div>
          <code>
            {submitError?.message || 'Сервер не смог обработать пакет документов. Возможно, база данных временно недоступна.'}
          </code>
        </div>
      )}

      {/* Общий лоадер отправки */}
      {isSubmitting && <div style={{ color: 'orange', fontSize: 'small', fontFamily: 'monospace', textAlign: 'center' }}>⏳ Асинхронная транзакция: передача данных на сервер...</div>}

      {/* Динамическая панель управления стейт-машины */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Кнопка 1: Вспомогательное действие (Назад / Сброс) */}
        {form.actions.secondaryLabel && (
          <button
            onClick={form.actions.onSecondary}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
            disabled={!form.actions.secondaryEnabled || isSubmitting}
          >
            {form.actions.secondaryLabel}
          </button>
        )}

        {/* Специфичный вызов инпута файлов для Шага 2 */}
        {form.currentStep === 'FILES' && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--contained'])}
            disabled={form.files.length >= 5 || isSubmitting}
          // style={{ flex: 1 }}
          >
            📎 ПРИКРЕПИТЬ ФАЙЛЫ
          </button>
        )}

        {/* Кнопка 2: Главное действие стейт-машины (Далее / Отправить) */}
        <button
          onClick={form.actions.onPrimary}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], {
            [btnClasses['neonBtn--contained']]: form.actions.primaryEnabled,
            [btnClasses['neonBtn--outlined']]: !form.actions.primaryEnabled
          })}
          disabled={!form.actions.primaryEnabled || isSubmitting}
        // style={{ flex: 1, borderColor: form.actions.primaryEnabled ? '#42b883' : '#333' }}
        >
          {form.actions.primaryLabel}
        </button>
      </div>
    </div>
  )
}
