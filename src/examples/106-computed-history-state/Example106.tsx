import { useState } from 'react'
import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { ReactiveEngine } from '../../core'
import { HistoryStateLogic } from './service.HistoryStateLogic'
import { Input } from '../shared/Input'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const HistoryStateExample = () => {
  const logic = engine.inject(HistoryStateLogic)

  // Точечные подписки на реактивные сигналы и computed свойства
  const userState = engine.use(logic.state)
  const serverLogs = engine.use(logic.serverLogs)
  const canUndo = engine.use(logic.canUndo)

  // Состояние отправщика (дизайнерские логи загрузки)
  const { loading: isSyncing } = useReactiveValue(logic.syncResource)

  // Локальный стейт для буферизации ввода в инпут
  const [nameInput, setNameInput] = useState(userState.username)

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ width: '600px', fontFamily: 'system-ui' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>LocalStorage Cache & State Undo Demo</div>

      {/* Вывод текущего состояния (Синхронизировано с кэшем) */}
      <div style={{ color: '#fff', background: '#15151a', padding: '16px', borderRadius: '8px', fontFamily: 'monospace' }}>
        <div style={{ color: '#00b4d8', fontWeight: 'bold', marginBottom: '4px' }}>Текущий стейт (в LocalStorage):</div>
        • Имя: <span>{userState.username}</span><br />
        • Тема: <span>{userState.theme}</span><br />
        • Размер шрифта: <span>{userState.fontSize}px</span>
      </div>

      {/* Панель изменения стейта */}
      <div className={baseClasses.stack2}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', width: '100%' }}>
          <Input
            type="text"
            placeholder="Изменить имя..."
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
          <button
            onClick={() => logic.toggleTheme()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
            style={{ flex: 1 }}
          >
            Переключить тему
          </button>
          <button
            onClick={() => logic.changeFontSize(2)}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
            style={{ flex: 1 }}
          >
            Шрифт +2px
          </button>
          <button
            onClick={() => logic.changeFontSize(-2)}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
            style={{ flex: 1 }}
          >
            Шрифт -2px
          </button>
        </div>
      </div>

      {/* Панель истории (Откат и Сброс) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: '16px', alignItems: 'center', width: '100%' }}>
        <button
          disabled={!canUndo}
          onClick={() => logic.undo()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
          style={{ gridColumn: 'span 3' }}
        >
          ↩️ Откатить (Undo)
        </button>
        <button
          onClick={() => logic.updateUsername(nameInput)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
          style={{ gridColumn: 'span 3' }}
        >
          Применить
        </button>
        <button
          onClick={() => {
            logic.reset()
            setNameInput('Guest')
          }}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--danger'], btnClasses['neonBtn--outlined'])}
          style={{ gridColumn: 'span 6' }}
        >
          Очистить всё
        </button>
      </div>

      {/* Терминал фейковых логов отправки на бэкенд */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <div style={{ fontSize: 'small', display: 'flex', justifyContent: 'space-between' }}>
          <span>Лог сетевой синхронизации действий:</span>
          {isSyncing && <span>⏳ Синхронизация с сервером...</span>}
        </div>
        <div style={{ background: '#111', height: '120px', borderRadius: '8px', padding: '10px', overflowY: 'auto', fontSize: 'small', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {serverLogs.length === 0 ? (
            <span style={{ color: '#aaa' }}>Ожидание действий пользователя...</span>
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
