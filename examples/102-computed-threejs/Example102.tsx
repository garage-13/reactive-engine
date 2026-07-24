import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { Cube3DLogic } from './service.Cube3DLogic.v2'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const ThreeJsExample = () => {
  const logic = engine.inject(Cube3DLogic)

  const currentSpeed = engine.use(logic.rotationSpeed)
  const currentColor = engine.use(logic.color)
  const statusInfo = engine.use(logic.statusInfo)

  const canvasContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (canvasContainerRef.current) {
      logic.initializeScene(canvasContainerRef.current)
    }
    return () => {
      logic.destroyScene()
    }
  }, [logic])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{
        fontFamily: 'system-ui',
        minWidth: 'min(400px, calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px))',
      }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Three.js + Signals & Computed Demo</div>

      <div style={{ background: '#15151a', padding: '16px', borderRadius: '8px', width: '100%', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace', color: '#fff' }}>
        {statusInfo}
      </div>

      <div
        ref={canvasContainerRef}
        style={{ width: '100%', height: '250px', background: '#15151a', borderRadius: '8px', overflow: 'hidden' }}
      />

      {/* Панель управления 1: Выбор цвета (Оптимизированный рендер через массив) */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
        <span>Цвет:</span>
        {[
          { hex: '#1a73e8', label: 'Синий' },
          { hex: '#4caf50', label: 'Зелёный' },
          { hex: '#f44336', label: 'Красный' }
        ].map((colorItem) => {
          const isActive = currentColor === colorItem.hex

          return (
            <button
              key={colorItem.hex}
              title={colorItem.label}
              onClick={() => logic.changeColor(colorItem.hex)}
              style={{
                width: '24px',
                height: '24px',
                background: colorItem.hex,
                cursor: 'pointer',
                borderRadius: '4px',
                // Исправили невалидные 'none' значения на стандартные CSS свойства
                border: isActive ? '2px solid #fff' : '2px solid transparent',
                outline: isActive ? '2px solid #00b4d8' : '0 solid transparent',
                outlineOffset: isActive ? '2px' : '0px',
                transition: 'all 0.15s ease', // Добавили плавность для более приятного UX
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
        {/* Кнопка динамически меняется: Пауза / Продолжить */}
        {currentSpeed === 0 ? (
          <button
            onClick={() => logic.resumeSpeed()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
          >
            Play
          </button>
        ) : (
          <button
            onClick={() => logic.setSpeed(0)}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
          >
            Pause
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
        <button
          disabled={currentSpeed === 1}
          onClick={() => logic.setSpeed(1)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
          style={{ opacity: currentSpeed === 1 ? 0.5 : 1 }}
        >
          Speed x1
        </button>

        <button
          disabled={currentSpeed === 3}
          onClick={() => logic.setSpeed(3)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
          style={{ opacity: currentSpeed === 3 ? 0.5 : 1 }}
        >
          Speed x3
        </button>
      </div>
    </div>

  )
}
