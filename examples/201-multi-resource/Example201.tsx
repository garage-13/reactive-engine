import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import clsx from 'clsx'
import { useUserInfoService, useSecondaryService } from './store'
import { useReactiveValue as useR } from '@pravosleva/reactive-engine/react'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

export const Example201 = () => {
  const _userInfo = useUserInfoService()
  const personList = useR(_userInfo.personList)
  const activePersonId = useR(_userInfo.activePersonId)
  const apiState = useR(_userInfo.apiState)

  const _secondaryService = useSecondaryService()
  const secondaryApiState = useR(_secondaryService.apiState)

  return (
    <div
      className={clsx(
        baseClasses.unit,
        baseClasses['unit--wide'],
        baseClasses.stack2)
      }
    >
      <div
        className={baseClasses.absoluteUnitLabel}
        title='Chain of Resources & observer'
      >
        Chain of Resources & observer
      </div>
      <code>{BASE_API_URL}</code>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <button onClick={_userInfo.inc} className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>
          Refresh account data
        </button>
        {
          personList.map((p) => (
            <button
              key={p.id}
              onClick={() => _userInfo.setActivePersonId(p.id)}
              className={
                clsx(
                  btnClasses.btn,
                  btnClasses.neonBtn,
                  btnClasses['neonBtn--secondary'],
                  {
                    [btnClasses['neonBtn--contained']]: !!activePersonId && p.id === activePersonId,
                    [btnClasses['neonBtn--outlined']]: p.id !== activePersonId,
                  },
                )
              }
            >{p.name}</button>
          ))
        }
      </div>
      <div className={baseClasses.unitInternalWrapper}>
        <div className={baseClasses.stack2}>
          <div>{apiState.loading ? '🟡 loading...' : !!apiState.data ? '🟢 ok' : !!apiState.error ? `🔴 err | ${apiState.error?.message || 'No error msg'}` : '⚪'}</div>
          <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data: apiState.data }, null, 2)}</pre>
        </div>
        <div className={baseClasses.stack2}>
          <div>{secondaryApiState.loading ? '🟡 loading...' : !!secondaryApiState.data ? '🟢 ok' : !!secondaryApiState.error ? `🔴 err | ${secondaryApiState.error?.message || 'No error msg'}` : '⚪'}</div>
          <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data: secondaryApiState.data }, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}
