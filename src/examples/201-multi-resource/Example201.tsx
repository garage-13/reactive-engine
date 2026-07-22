import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import clsx from 'clsx';
import { useUserInfoService, observer, useSecondaryService } from './store';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

export const Example201 = observer(() => {
  const userInfo = useUserInfoService()
  const secondaryService = useSecondaryService()

  return (
    <div
      className={clsx(
        baseClasses.unit,
        baseClasses['unit--wide'],
        baseClasses.stack2)
      }
    >
      <div className={baseClasses.absoluteUnitLabel} title='Chain of Resources & observer'>example 21 | Chain of Resources & observer</div>
      <code>{BASE_API_URL}</code>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => userInfo.inc()} className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>Refresh account data</button>
        {
          userInfo.personList.value.map((p) => (
            <button
              key={p.id}
              onClick={() => userInfo.setActivePersonId(p.id)}
              className={
                clsx(
                  btnClasses.btn,
                  btnClasses.neonBtn,
                  btnClasses['neonBtn--secondary'],
                  {
                    [btnClasses['neonBtn--contained']]: !!userInfo.activePersonId.value && p.id === userInfo.activePersonId.value,
                    [btnClasses['neonBtn--outlined']]: p.id !== userInfo.activePersonId.value,
                  },
                )
              }
            >{p.name}</button>
          ))
        }
      </div>
      <div className={baseClasses.unitInternalWrapper}>
        <div className={baseClasses.stack2}>
          <div>{userInfo.apiState.loading ? '🟡 loading...' : !!userInfo.apiState.data ? '🟢 ok' : !!userInfo.apiState.error ? `🔴 err | ${userInfo.apiState.error?.message || 'No error msg'}` : '⚪'}</div>
          <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data: userInfo.apiState.data }, null, 2)}</pre>
        </div>
        <div className={baseClasses.stack2}>
          <div>{secondaryService.apiState.loading ? '🟡 loading...' : !!secondaryService.apiState.data ? '🟢 ok' : !!secondaryService.apiState.error ? `🔴 err | ${secondaryService.apiState.error?.message || 'No error msg'}` : '⚪'}</div>
          <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data: secondaryService.apiState.data }, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
})
