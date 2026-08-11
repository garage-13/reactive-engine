import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/react'
import clsx from 'clsx'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-200:signal:counter');
  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      if (counterValue === 0)
        throw new Error(`[THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY=1] [MESSAGE=Stop for count value ${counterValue} - excepted from fetcher fn body]`)

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
    this.counter,
    {
      name: 'example-200:resource',
    }
  )

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true, // Включаем логгер
    traceTime: true, // Добавляем вывод таймингов по желанию
    filter: /^example-200:*/ // Можно фильтровать только нужные логи
  }
})

export const Example200 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)
  const { loading, data, error } = useReactiveValue(logic.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Resource example</div>
      <code>{BASE_API_URL}</code>
      <div style={{ minWidth: '100%' }}>
        <button onClick={() => logic.inc()} className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>
          ({counter}) Refresh account data
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{loading ? '🟡 loading...' : !!data ? '🟢 ok' : !!error ? '🔴 err' : '⚪'}</span>
        {!!error?.message && <em>{error?.message}</em>}
      </div>
      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
