import { MouseEvent } from 'react'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/react'
import { Throttle2DLogic } from './service.Throttle2DLogic'
import baseClasses from '~/ui.common.module.scss'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const Throttle2DExample = () => {
  const logic = engine.inject(Throttle2DLogic)

  // Подписываемся на сырой сигнал координат и обработанный ресурс аналитики
  const coords = engine.use(logic.coordsSignal)
  const { loading, data: analyticsResult } = useReactiveValue(logic.analyticsResource)

  // Перехват движения мыши внутри зоны
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)

    // Спамим изменения в сигнал на каждый пиксель движения
    logic.updateCoords(x, y)
  }

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui', width: '600px' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Simple Throttle Mouse Tracking Demo</div>

      <div className={baseClasses.stack1}>
        {/* Индикаторы текущего состояния */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'small' }}>
          <span>Сырые координаты из сигнала:</span>
          <span style={{ fontFamily: 'monospace', color: '#00b4d8' }}>X: {coords.x}, Y: {coords.y}</span>
        </div>

        {/* Интерактивная зона для вождения мышкой */}
        <div
          onMouseMove={handleMouseMove}
          style={{ width: '100%', height: '180px', background: '#15151a', borderRadius: '8px', cursor: 'crosshair', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
        >
          <span style={{ color: '#aaa', fontSize: '13px' }}>Двигайте курсор внутри этой зоны</span>
        </div>
      </div>

      {/* Терминал вывода затроттленной аналитики */}
      <div className={baseClasses.stack1}>
        <div style={{ fontSize: 'small', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span>Результат обработки (не чаще 1 раза в 300мс):</span>
          {loading && <span style={{ color: '#e6af2e' }}>⏳ Расчёт...</span>}
        </div>
        <div style={{ background: '#111', borderRadius: '8px', padding: '12px', minHeight: '44px', display: 'flex', alignItems: 'center', fontSize: '13px', fontFamily: 'monospace', color: '#4caf50' }}>
          {analyticsResult || <span style={{ color: '#aaa' }}>Запустите движение мыши...</span>}
        </div>
      </div>
    </div>
  )
}
