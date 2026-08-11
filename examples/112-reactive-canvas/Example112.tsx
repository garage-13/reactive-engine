import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { TelemetryLogic } from './service.TelemetryLogic'
import clsx from 'clsx'

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: false,
    filter: /^example-112:computed.*/
  }
})

export const Example112 = () => {
  const logic = engine.inject(TelemetryLogic);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Подписываемся на расширенный computed-мост
  const liveMetrics = engine.use(logic.uiBridge);

  useEffect(() => {
    logic.startMonitoring();

    let disconnectPainter: (() => void) | null = null;
    if (canvasRef.current) {
      disconnectPainter = logic.connectCanvasPainter(canvasRef.current);
    }

    return () => {
      if (disconnectPainter) disconnectPainter(); // Останавливаем плавную волну Canvas
      logic.destroy();                             // Останавливаем фоновый сбор и удаляем эффекты ядра
    };
  }, [logic]);

  // Вычисляем цвет индикатора прогресса в зависимости от нагрузки на лимит
  const getProgressColor = (percent: number) => {
    if (percent > 80) return '#ff4a4a'; // Критический жор памяти (Красный)
    if (percent > 50) return 'orange';  // Повышенный расход (Оранжевый)
    return '#42b883';                   // Норма (Зеленый)
  };

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)} style={{ width: '600px' }}>
      <div className={baseClasses.absoluteUnitLabel}>Real-time Canvas Telemetry (Proxy Object)</div>

      {/* 🌟 ДЕТАЛЬНЫЙ МОНИТOРИНГ ЛИМИТОВ ПАМЯТИ: Полоса утилизации кучи */}
      <div style={{ background: '#1a1a24', padding: '10px', borderRadius: '8px', border: '1px solid #252530', fontSize: '12px', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#999' }}>
          <span>Утилизация лимита вкладки: <b style={{ color: getProgressColor(liveMetrics.memPercentage) }}>{liveMetrics.memPercentage}%</b></span>
          <span>Макс. лимит: <b style={{ color: '#aaa' }}>{liveMetrics.limitMem} MB</b></span>
        </div>

        {/* Трек полосы прогресса */}
        <div style={{ width: '100%', height: '6px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${liveMetrics.memPercentage}%`,
              height: '100%',
              background: getProgressColor(liveMetrics.memPercentage),
              transition: 'width 0.4s ease, background-color 0.4s ease'
            }}
          />
        </div>
      </div>

      {/* Верхняя панель метрик */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '12px' }}>
        <div>⚡ FPS: <span style={{ color: liveMetrics.fps < 50 ? '#ff4a4a' : '#42b883', fontWeight: 'bold' }}>{liveMetrics.fps}</span></div>
        <div>⏳ Латентность: <span style={{ color: liveMetrics.latency > 5 ? 'orange' : '#aaa' }}>{liveMetrics.latency} ms</span></div>
        <div>
          🧠 Heap: <span style={{ color: '#007acc', fontWeight: 'bold' }}>{liveMetrics.usedMem} MB</span>
          <span style={{ color: '#666' }}> / {liveMetrics.allocatedMem} MB (выделено)</span>
        </div>
      </div>

      {/* Высокопроизводительный холст Canvas */}
      <div style={{ background: '#111115', padding: '8px', borderRadius: '8px', border: '1px solid #222' }}>
        <canvas
          ref={canvasRef}
          width="568"
          height="120"
          style={{ display: 'block', width: '100%', height: '120px' }}
        />
      </div>

      {/* 🌟 ПАНЕЛЬ УПРАВЛЕНИЯ СТРЕСС-ТЕСТАМИ */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '0px' }}>
        <button
          onClick={logic.leakMemory}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >
          💥 Забить Heap (+30MB)
        </button>

        <button
          onClick={logic.blockEventLoop}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          🛑 Заблокировать поток (200ms)
        </button>

        <button
          onClick={logic.triggerGarbageCollection}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
        >
          ♻️ Очистить ссылки (GC)
        </button>
      </div>
    </div>
  )
}
