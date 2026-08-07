import { useEffect } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/react'
import clsx from 'clsx'
import { AudioPlayerLogic } from './service.AudioPlayerLogic'

const engine = new ReactiveEngine()

export const AudioPlayerExample = () => {
  const logic = engine.inject(AudioPlayerLogic)
  const { loading, error } = useReactiveValue(logic.audioResource)
  const currentTrackId = engine.use(logic.currentTrackId)
  const isPlaying = engine.use(logic.isPlaying)

  useEffect(() => {
    return () => {
      logic.destroy()
    }
  }, [logic])

  const activeTrack = logic.tracks.find(t => t.id === currentTrackId)

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui', minWidth: '400px' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>Simple Audio Player (DI + Cache)</div>

      <div className={baseClasses.stack2}>
        {logic.tracks.map((track) => {
          const isSelected = track.id === currentTrackId
          const isThisTrackError = isSelected && !!error

          return (
            <div
              key={track.id}
              onClick={() => logic.selectTrack(track.id)}
              style={{
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: isThisTrackError ? '2px solid #ef5350' : isSelected ? '2px solid #1a73e8' : '2px solid lightgray',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                alignItems: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              <b>{track.title}</b>
              {
                isThisTrackError
                  ? <span>Ошибка загрузки 🔴</span>
                  : isSelected && loading
                    ? <span>Загрузка... 🟡</span>
                    : isSelected
                      ? <span>🟢</span>
                      : <span>⚪</span>
              }
            </div>
          )
        })}
      </div>

      {activeTrack && (
        <div className={baseClasses.stack2}>
          <div style={{ textAlign: 'left' }}>
            Выбрано: <b>{activeTrack.title}</b>
          </div>

          {error && (
            <div style={{ color: '#ef5350', width: '100%', textAlign: 'center' }}>
              Error: {error.message}
            </div>
          )}

          {
            !error && (
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', width: '100%' }}>
                <button
                  disabled={loading || !!error || isPlaying}
                  onClick={() => logic.play()}
                  className={clsx(
                    btnClasses.btn,
                    btnClasses.neonBtn,
                    btnClasses['neonBtn--primary'],
                    {
                      [btnClasses['neonBtn--outlined']]: !isPlaying,
                      [btnClasses['neonBtn--contained']]: isPlaying
                    },
                  )}
                  style={{ opacity: loading || !!error || isPlaying ? 0.5 : 1 }}
                >
                  Play
                </button>

                <button
                  disabled={!isPlaying}
                  onClick={() => logic.stop()}
                  className={clsx(
                    btnClasses.btn,
                    btnClasses.neonBtn,
                    {
                      [btnClasses['neonBtn--primary']]: isPlaying,
                      [btnClasses['neonBtn--secondary']]: !isPlaying,
                    },
                    btnClasses['neonBtn--outlined']
                  )}
                  style={{ opacity: !isPlaying ? 0.5 : 1 }}
                >
                  Stop
                </button>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}
