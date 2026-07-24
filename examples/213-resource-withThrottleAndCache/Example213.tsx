import { MouseEvent } from 'react'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import { ThrottleCacheLogic } from './service.ThrottleCacheLogic'
import baseClasses from '~/ui.common.module.scss'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const ThrottleCacheExample = () => {
  const logic = engine.inject(ThrottleCacheLogic)

  const coords = engine.use(logic.gridCoords)
  const fetchCount = engine.use(logic.fetchCount)
  const { loading, data: result } = useReactiveValue(logic.gridResource)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)
    logic.updateCoords(x, y)
  }

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui', width: '600px' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Throttle + Cache Combo Demo</div>

      {/* Аналитические счетчики */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'small', background: '#15151a', padding: '16px', borderRadius: '8px', color: '#fff' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>Зона сетки:</span>
          <span style={{ color: '#00b4d8', fontFamily: 'monospace' }}>{coords.x}:{coords.y}</span>
        </div>
        <div
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <span>Запросов к API:</span>
          <span style={{ color: '#f44336', fontWeight: 'bold' }}>{fetchCount}</span>
        </div>
      </div>

      {/* Интерактивный интерактивный холст */}
      <div
        onMouseMove={handleMouseMove}
        style={{ width: '100%', height: '180px', background: '#15151a', borderRadius: '8px', cursor: 'crosshair', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', position: 'relative' }}
      >
        <span style={{ color: '#aaa', fontSize: 'small' }}>Водите курсор для исследования секторов</span>
      </div>

      {/* Терминал вывода */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <div style={{ fontSize: 'small', display: 'flex', justifyContent: 'space-between' }}>
          <span>Статус обработки:</span>
          {loading && <span style={{ color: '#e6af2e' }}>⏳ Тяжелый запрос к бэкенду...</span>}
          {!loading && <span style={{ color: '#4caf50' }}>⚡ Ответ получен</span>}
        </div>
        <div style={{ background: '#111', borderRadius: '6px', padding: '12px', minHeight: '44px', display: 'flex', alignItems: 'center', fontSize: '12px', fontFamily: 'monospace', color: '#4caf50' }}>
          {result || <span style={{ color: '#aaa' }}>Запустите движение мыши...</span>}
        </div>
      </div>
    </div>
  )
}
