import { ReactiveEngine } from '../../core'
import { SearchLogic } from './service.SearchLogic'
import { Input } from '../shared/Input'
import baseClasses from '../ui.common.module.scss'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const SearchExample = () => {
  const logic = engine.inject(SearchLogic)

  // Подписываемся на сигналы и ресурс
  const query = engine.use(logic.querySignal)
  const { loading, data: results, error } = useReactiveValue(logic.searchResource)

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{
        fontFamily: 'system-ui',
        width: 'max(100px, calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px))'
      }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Simple Debounce Search Demo</div>

      {/* Поле ввода текста */}
      <div className={baseClasses.stack1} style={{ width: '100%', color: '#000' }}>
        <label style={{ fontSize: 'small' }}>Живой поиск (дебаунс 500мс):</label>
        <Input
          variant='outlined'
          type="text"
          placeholder="Начните вводить текст..."
          value={query}
          onChange={(e) => logic.updateQuery(e.target.value)}
        />
      </div>

      {/* Статус-бар загрузки */}
      <div className={baseClasses.stack1} style={{ fontSize: 'small' }}>
        {
          loading
            ? <span style={{ color: '#e6af2e' }}>⏳ Ждем окончания ввода и ответа сервера...</span>
            : (query && !results)
              ? <span>Печатайте дальше...</span>
              : <span>Печатайте дальше...</span>
        }
        {error && <span style={{ color: '#ef5350' }}>❌ Ошибка: {error.message}</span>}
      </div>

      {/* Отрендеренный список результатов */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        <div style={{ fontSize: 'small' }}>Результаты выдачи:</div>
        <div style={{ background: '#111', borderRadius: '6px', padding: '12px', minHeight: '80px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
          {results && results.map((item, idx) => (
            <div key={idx} style={{ color: '#4caf50' }}>{item}</div>
          ))}
          {!query.trim() && <span style={{ color: '#aaa' }}>Строка поиска пуста</span>}
          {query.trim() && !loading && !results && <span style={{ color: '#aaa' }}>Запрос задебаунсен...</span>}
        </div>
      </div>
    </div>
  )
}
