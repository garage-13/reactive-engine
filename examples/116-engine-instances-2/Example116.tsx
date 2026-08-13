import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { hostEngine, widgetEngine, hostLogic, widgetLogic } from './service.Example116'
import clsx from 'clsx'

export const Example116 = () => {
  // 🟢 Оформляем подписки для вывода на экран через соответствующие инстансы движков
  const activeUserId = hostEngine.use(hostLogic.activeUserId)
  const widgetStatus = widgetEngine.use(widgetLogic.widgetStatus)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)} style={{ width: '600px', display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui' }}>
      <div className={baseClasses.absoluteUnitLabel}>Engine instances sample</div>

      {/* СЛОЙ 1: ХОСТ ПРИЛОЖЕНИЕ (ДВИЖЕК 1) */}
      <div
        className={baseClasses.stack1}
        style={{ padding: '16px', background: '#1a1a24', borderRadius: '16px' }}
      >
        <h4 style={{ color: '#00b4d8' }}>🌐 Хост-приложение (Engine #1)</h4>
        <div style={{ fontSize: 'small', fontFamily: 'monospace', background: '#000', padding: '8px', borderRadius: '6px', marginBottom: '10px', color: '#ccc' }}>
          Текущий пользователь в Системе: <b>{activeUserId}</b>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => hostLogic.switchUser('user-1')}
            className={clsx(
              btnClasses.btn,
              btnClasses.neonBtn,
              btnClasses['neonBtn--primary'],
              {
                [btnClasses['neonBtn--contained']]: activeUserId === 'user-1',
                [btnClasses['neonBtn--outlined']]: activeUserId !== 'user-1'
              }
            )}
          >
            User 1
          </button>
          <button
            onClick={() => hostLogic.switchUser('user-2')}
            className={clsx(
              btnClasses.btn,
              btnClasses.neonBtn,
              btnClasses['neonBtn--primary'],
              {
                [btnClasses['neonBtn--contained']]: activeUserId === 'user-2',
                [btnClasses['neonBtn--outlined']]: activeUserId !== 'user-2'
              }
            )}
          >
            User 2
          </button>
        </div>
      </div>

      {/* СЛОЙ 2: ИЗОЛИРОВАННЫЙ ВИДЖЕТ (ДВИЖЕК 2) */}
      <div
        className={baseClasses.stack1}
        style={{ padding: '16px', background: '#111116', borderRadius: '16px' }}
      >
        <h4 style={{ color: '#42b883' }}>🧩 Изолированный Плагин-Виджет (Engine #2)</h4>
        <div style={{ fontSize: 'small', fontFamily: 'monospace', background: '#000', padding: '8px', borderRadius: '6px', marginBottom: '10px', color: '#ccc' }}>
          {widgetStatus}
        </div>

        <button
          onClick={() => widgetLogic.incLocal()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--contained'])}
        >
          💥 Локальный клик виджета (+1)
        </button>
      </div>

    </div>
  )
}
