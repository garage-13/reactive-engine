import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { BaseREService } from '../../BaseREService'
import { ReactiveEngine } from '../../core'
import clsx from 'clsx';
import { useReactiveValue } from '../../hooks';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

class Logic extends BaseREService {
  public counter = this.engine.signal<number>(0, 'example-23:signal:counter');

  public apiState = this.engine.resource(
    async (counterValue, abortSignal) => {
      // Имитируем запрос к бэкенду, который искусственно зависает на 15 секунд
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search`,
          '?',
          [
            `counter=${counterValue}`,
            '_responseDelay=15000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      )
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    },
    this.counter,
    {
      name: 'example-23:resource:timeout-and-retry',
      timeout: 2500,               // Прервать запрос, если сервер не отвечает более 2.5 секунд
      retryCount: 3,               // Сделать до 3 повторных попыток после каждого таймаута
      retryDelay: 1000,            // Базовая задержка между попытками
      isExponentialBackoffEnabled: true, // Прогрессивно увеличивать паузу (~1с -> ~2с -> ~4с)
      maxRetryDelay: 5000,         // Ограничить максимальное время ожидания 5 секундами
      validateBeforeFetch: (counterValue) => {
        if (counterValue === 0) {
          return `Not started (pre-validation before fetch) for count value ${counterValue}`;
        }
        return true; // Валидация успешна, можно делать fetch
      },
    }
  )

  /* NOTE: Итого ожидается
  - Всего сетевых вызовов: 4 запроса (1 стартовый + 3 повторных)
  - Максимальное время на один запрос: Строго 2.5 секунды
  - Общее время удержания лоадера на экране: Около 17 секунд (4 запроса по 2.5 секунды + ~7 секунд суммарного сна в паузах между ними)
  */

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example23 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  // Извлекаем из хука данные, ошибку и наш новый реактивный флаг повторных попыток
  const { loading, data, error, isRetrying } = useReactiveValue(logic.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel} title='Resource with timeout support'>
        example 23 | Resource with timeout support
      </div>
      <code>{BASE_API_URL}</code>

      <div style={{ minWidth: '100%' }}>
        <button
          onClick={() => logic.inc()}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >
          ({counter}) Test Request Timeout
        </button>
      </div>

      <div className={baseClasses.unitInternalWrapper}>
        <div style={{ display: 'flex', gap: '8px', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Интеллектуальный вывод статуса: если идет повтор, подсвечиваем его отдельно */}
          <span>
            {isRetrying ? '🟠 retrying (timeout)...' :
              loading ? '🟡 loading...' :
                !!data ? '🟢 ok' :
                  !!error ? '🔴 err' : '⚪'}
          </span>

          {/* Текст ошибки выводим только тогда, когда движок исчерпал все попытки и окончательно сдался */}
          {!isRetrying && !!error?.message && <em>{error?.message}</em>}
        </div>
      </div>

      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
