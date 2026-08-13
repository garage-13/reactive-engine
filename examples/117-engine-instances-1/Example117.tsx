// src/examples/example-117/Example117.tsx
import { useEffect } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { hostEngine, widgetEngine, hostLogic, widgetLogic } from './service.Example117'
import clsx from 'clsx'

export const Example117 = () => {
  // Пассивные подписки на слои отображения
  const activeUserId = hostEngine.use(hostLogic.activeUserId)
  const widgetStatus = widgetEngine.use(widgetLogic.widgetStatus)

  // 🌟 ДИНАМИЧЕСКИЙ UI-МОСТ (Способ 3):
  // Время жизни этой связи намертво привязано к маунту данного компонента.
  useEffect(() => {
    // Подписываемся на изменения в Первом движке (Host) через эффект ядра
    const unsubscribeHost = hostEngine.effect(() => {
      const freshHostUserId = hostLogic.activeUserId.value // Трекаем Engine 1

      // Синхронно транслируем значение во Второй движок (Widget)
      widgetLogic.currentTargetUser.value = freshHostUserId // Пушим в Engine 2
    }, 'host:bridge:ui-level-sync [IS_OPTIMIZED=1]')

    // 🧹 АВТO-CLEANUP: Как только компонент размонтируется — мост синхронно уничтожится,
    // полностью разрывая связь в памяти и предотвращая утечки ресурсов (Memory Leaks)!
    return () => unsubscribeHost()
  }, [])

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
