import { useEffect } from 'react'
import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { ReactiveEngine } from '../../core'
import { LiveNotificationsLogic } from './service.LiveNotificationsLogic'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const LiveNotificationsExample = () => {
  const logic = engine.inject(LiveNotificationsLogic)

  const userId = engine.use(logic.userIdSignal)
  const isServerOnline = engine.use(logic.isServerOnline)
  const isLoopActive = engine.use(logic.isLoopActive)
  const isTabActive = engine.use(logic.isTabActive) // Подписываемся на флаг вкладки
  const requestCount = engine.use(logic.requestCount)
  const currentStatus = engine.use(logic.currentStatus)

  const secondsToRetry = engine.use(logic.countdown.secondsLeft)
  const receivedNotifications = engine.use(logic.receivedNotifications)
  const outgoingBuffer = engine.use(logic.outgoingBuffer)

  // ИСПРАВЛЕНИЕ: Комплексный эффект инициализации и отслеживания активности вкладки
  useEffect(() => {
    logic.startLongPolling()

    const handleVisibilityChange = () => {
      // Передаем статус видимости вкладки (true/false) в бизнес-сервис
      logic.setTabVisibility(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      logic.destroy()
    }
  }, [logic])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ padding: '24px', fontFamily: 'system-ui', width: '600px' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>
        Long Polling Live Stream Demo {!isTabActive && '⏸️'}
      </div>

      {/* Описание */}
      <div style={{ fontSize: 'small' }}>
        ⚙️ С помощью кнопок <strong>Init</strong> и <strong>Destroy</strong> вы можете полностью
        запускать и гасить фоновые сетевые потоки. Переключение между ними абсолютно взаимоисключающее.
      </div>

      {/* УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ (Строго ваша стилистика кнопок) */}
      <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
        <button
          disabled={isLoopActive}
          onClick={() => logic.startLongPolling()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], {
            [btnClasses['neonBtn--outlined']]: isLoopActive,
            [btnClasses['neonBtn--contained']]: !isLoopActive,
          })}
          style={{ flex: 1, opacity: isLoopActive ? 0.3 : 1 }}
        >
          Init
        </button>
        <button
          disabled={!isLoopActive}
          onClick={() => logic.destroy()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--danger'], btnClasses['neonBtn--outlined'])}
          style={{ flex: 1, opacity: !isLoopActive ? 0.3 : 1 }}
        >
          Destroy
        </button>
      </div>

      {/* Индикаторы сети */}
      <div style={{ display: 'flex', justifyContent: 'space-between', background: '#15151a', color: '#fff', padding: '16px', borderRadius: '8px', fontSize: '13px' }}>
        <div>
          Сессия: <strong style={{ color: '#00b4d8' }}>{userId}</strong>
          {!isTabActive && <span style={{ color: '#ffb74d', marginLeft: '8px' }}>(Вкладка в фоне)</span>}
        </div>
        <div>Совершено HTTP-запросов: <strong style={{ color: '#e6af2e' }}>{requestCount}</strong></div>
      </div>

      {/* Переключатель сервера */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
          <span style={{
            display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
            background: isServerOnline ? '#4caf50' : '#ef5350',
            boxShadow: isServerOnline ? '0 0 8px #4caf50' : '0 0 8px #ef5350'
          }} />
          <span>Бэкенд: <strong>{isServerOnline ? 'ONLINE' : 'OFFLINE (502)'}</strong></span>
        </div>

        <button
          disabled={!isLoopActive}
          onClick={() => logic.toggleServerStatus()}
          className={clsx(
            btnClasses.btn,
            btnClasses.neonBtn,
            {
              [btnClasses['neonBtn--primary']]: !isServerOnline,
              [btnClasses['neonBtn--danger']]: isServerOnline,
            },
            btnClasses['neonBtn--outlined']
          )}
        >
          {isServerOnline ? 'Выключить сервер' : 'Включить сервер'}
        </button>
      </div>

      {/* Статус-бар */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', minHeight: '38px', background: '#111', borderRadius: '8px', padding: '6px 12px', textAlign: 'center' }}>
        {!isServerOnline && isLoopActive ? (
          <span style={{ color: '#ef5350' }}>
            🚨 Сеть разорвана. Накапливаем буфер. Переподключение через: <strong style={{ fontSize: '14px', color: '#fff', background: '#3a1a1a', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>{secondsToRetry} сек</strong>
          </span>
        ) : (
          <span style={{ color: !isLoopActive ? '#aaa' : currentStatus.includes('⚡') ? '#4caf50' : currentStatus.includes('⏳') ? '#e6af2e' : '#00b4d8', fontWeight: currentStatus.includes('⚡') ? 'bold' : 'normal' }}>
            {currentStatus}
          </span>
        )}
      </div>

      {/* Кнопки имитации действий */}
      <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
        <button
          onClick={() => logic.triggerEventOnServer('Новый лайк к статье', 'like')}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
          style={{ flex: 1 }}
        >
          👍 Имитировать Лайк
        </button>
        <button
          onClick={() => logic.triggerEventOnServer('Новое сообщение чата', 'message')}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
          style={{ flex: 1 }}
        >
          💬 Имитировать Сообщение
        </button>
      </div>

      {/* Таблица колонок */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%', marginTop: '8px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🟡 Те, что в очереди:</span>
            <span style={{ background: '#3a2510', color: '#ffb74d', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', border: '1px solid #ffb74d' }}>{outgoingBuffer.length}</span>
          </div>
          <div
            style={{
              background: '#000',
              height: '180px',
              borderRadius: '8px',
              padding: '12px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {outgoingBuffer.length === 0 ? (
              <span style={{ color: '#aaa', fontStyle: 'italic', fontSize: '13px', textAlign: 'center' }}>Очередь пуста.<br />Выключите сервер для накопления.</span>
            ) : (
              outgoingBuffer.map((item) => (
                <div key={item.id} style={{ color: '#ffb74d', fontSize: '13px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.type === 'like' ? '❤️' : '💬'} {item.text}</span>
                  <span style={{ color: '#666', fontSize: '10px' }}>{item.timestamp}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={baseClasses.stack1}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span>🟢 Успешно отправленные:</span>
              <span style={{ background: '#122b15', color: '#4caf50', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', border: '1px solid #4caf50' }}>{receivedNotifications.length}</span>
            </span>
            {receivedNotifications.length > 0 && (
              <button onClick={() => logic.clearFeed()} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px', padding: 0 }}>
                очистить
              </button>
            )}
          </div>
          <div
            style={{
              background: '#000',
              height: '180px',
              borderRadius: '8px',
              padding: '12px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {receivedNotifications.length === 0 ? (
              <span style={{ color: '#aaa', fontStyle: 'italic', fontSize: '13px', textAlign: 'center' }}>Нет доставленных событий.<br />Кликните по кнопкам выше.</span>
            ) : (
              receivedNotifications.map((item) => (
                <div key={item.id} style={{ color: item.type === 'like' ? '#ff6b6b' : '#4caf50', fontSize: '12px', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span>{item.type === 'like' ? '❤️' : '💬'}</span>
                    <span>{item.text}</span>
                  </span>
                  <span style={{ color: '#555', fontSize: '11px' }}>{item.timestamp}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
