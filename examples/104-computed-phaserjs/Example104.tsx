import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { Phaser2DLogic } from './service.Phaser2DLogic'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const Phaser2DExample = () => {
  const logic = engine.inject(Phaser2DLogic)

  // Извлекаем реактивные значения для синхронизации UI кнопок
  const currentCount = engine.use(logic.spriteCount)
  const currentSpeed = engine.use(logic.speed)
  const currentScale = engine.use(logic.spriteScale)
  const statusInfo = engine.use(logic.statusInfo)

  const phaserContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phaserContainerRef.current) {
      logic.initializePhaser(phaserContainerRef.current)
    }
    return () => {
      logic.destroyPhaser()
    }
  }, [logic])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ width: '500px', fontFamily: 'system-ui' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Phaser 3 Engine + Signals & Computed Demo</div>

      {/* Вывод реактивного computed текста */}
      <div style={{ background: '#15151a', padding: '16px', borderRadius: '8px', width: '100%', textAlign: 'center', fontSize: 'small', fontFamily: 'monospace', color: '#00b4d8' }}>
        {statusInfo}
      </div>

      {/* Контейнер для Phaser Canvas */}
      <div
        ref={phaserContainerRef}
        style={{ width: '100%', height: '250px', background: '#15151a', borderRadius: '8px', overflow: 'hidden' }}
      />

      {/* Панель 1: Количество объектов */}
      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <span>Объекты:</span>
        <button
          disabled={currentCount === 10}
          onClick={() => logic.setCount(10)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          10 шт
        </button>
        <button
          disabled={currentCount === 50}
          onClick={() => logic.setCount(50)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          50 шт
        </button>
        <button
          disabled={currentCount === 150}
          onClick={() => logic.setCount(150)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          150 шт
        </button>
      </div>

      {/* Панель 2: Скорость анимации / Физический импульс */}
      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <span>Скорость:</span>

        {currentSpeed === 0 ? (
          <button
            onClick={() => logic.resumeSpeed()}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
          >
            Продолжить
          </button>
        ) : (
          <button
            onClick={() => logic.setSpeed(0)}
            className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
          >
            Пауза
          </button>
        )}

        <button
          disabled={currentSpeed === 1}
          onClick={() => logic.setSpeed(1)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          1x
        </button>
        <button
          disabled={currentSpeed === 4}
          onClick={() => logic.setSpeed(4)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          4x
        </button>
      </div>

      {/* Панель 3: Масштаб */}
      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <span>Масштаб:</span>
        <button
          disabled={currentScale === 0.5}
          onClick={() => logic.setScale(0.5)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          0.5x
        </button>
        <button
          disabled={currentScale === 1}
          onClick={() => logic.setScale(1)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          1.0x
        </button>
        <button
          disabled={currentScale === 2}
          onClick={() => logic.setScale(2)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          2.0x
        </button>
      </div>
    </div>
  )
}
