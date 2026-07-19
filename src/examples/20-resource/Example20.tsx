import baseClasses from '../baseClasses.common.module.scss'
import btnClasses from '../baseClasses.buttons.module.scss'
import { BaseREService } from '../../BaseREService'
import { ReactiveEngine } from '../../core'
import clsx from 'clsx';
import { useReactiveValue } from '../../hooks';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

class Logic extends BaseREService {
  public counter = this.engine.signal<number>(0, 'example-20:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-20:computed:counter');
  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search`,
          '?',
          [
            `counter=${counterValue}`,
            '_responseDelay=2000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      )
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    },
    this.counter
  )

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example20 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)
  const { loading, data, error } = useReactiveValue(logic.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>example 20 | Resource</div>
      <code>{BASE_API_URL}</code>
      <div style={{ minWidth: '100%' }}>
        <button onClick={() => logic.inc()} className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>
          ({counter}) Refresh account data
        </button>
      </div>
      <div className={baseClasses.unitInternalWrapper}>
        <div>{loading ? '🟡 loading...' : !!data ? '🟢 ok' : !!error ? '🔴 err' : '⚪'}</div>
        {!!error?.message && <em>{error?.message}</em>}
      </div>
      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
