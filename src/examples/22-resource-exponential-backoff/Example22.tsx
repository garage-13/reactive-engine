import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { BaseREService } from '../../BaseREService'
import { ReactiveEngine } from '../../core'
import clsx from 'clsx';
import { useReactiveValue } from '../../hooks';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

class Logic extends BaseREService {
  public counter = this.engine.signal<number>(0, 'example-22:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-22:computed:counter');
  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search-incorrect`,
          '?',
          [
            `counter=${counterValue}`,
            '_responseDelay=10000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      )
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    },
    this.counter,
    {
      name: 'example-22:resource:exp-backoff-exp',
      retryCount: 4,               // Сделать до 4 повторов при ошибках сети
      retryDelay: 1000,            // Стартовая задержка 1 секунда
      isExponentialBackoffEnabled: true,    // Интервалы будут: ~1с -> ~2с -> ~4с -> ~8с
      maxRetryDelay: 10000,        // ИСПРАВЛЕНИЕ: Рост остановится на 10 секундах! Попытки 4, 5 и 6 будут ждать ~10с
      // Добавляем пре-валидацию входного сигнала на уровне настроек:
      // Если возвращает строку, ядро автоматически запишет её в error, минуя fetch и ретраи
      validateBeforeFetch: (counterValue) => {
        if (counterValue === 0) {
          return `Not started (pre-validation before fetch) for count value ${counterValue}`;
        }
        return true; // Валидация успешна, можно делать fetch
      },
    }
  )

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example22 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)
  const { loading, data, error, isRetrying } = useReactiveValue(logic.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel} title='Resource with exponential backoff support'>example 22 | Resource with exponential backoff support</div>
      <code>{BASE_API_URL}</code>
      <div style={{ minWidth: '100%' }}>
        <button onClick={() => logic.inc()} className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>
          ({counter}) Refresh account data
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{loading ? '🟡 loading...' : !!data ? '🟢 ok' : !!error ? '🔴 err' : '⚪'} | isRetrying: {String(isRetrying)}</span>
        {!!error?.message && <em>{error?.message}</em>}
      </div>
      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
