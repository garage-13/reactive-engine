import { useEffect } from 'react'
import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { ReactiveEngine } from '../../core'
import { AudioPlayerLogic } from './service.AudioPlayerLogic'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const AudioPlayerExample = () => {
  const logic = engine.inject(AudioPlayerLogic)
  const { loading, error } = useReactiveValue(logic.audioResource)
  const currentTrackId = engine.use(logic.currentTrackId)
  const isPlaying = engine.use(logic.isPlaying)

  /**
   * Жизненный цикл компонента: очистка и освобождение системных ресурсов плеера.
   *
   * Зачем нужен этот эффект:
   * 1. Предотвращение утечек памяти (Memory Leaks): Браузерный объект `AudioContext` является
   *    тяжелой системной сущностью, которая удерживает аудиовыходы устройства. Метод `logic.destroy()`
   *    принудительно закрывает контекст (`context.close()`) и отвязывает нативные узлы
   *    звука (`audioSourceNode.disconnect()`) в момент ухода компонента с экрана.
   * 2. Очистка оперативной памяти (Heap): Метод очищает накопительный кэш `audioCache.clear()`.
   *    Без этого декодированные бинарные массивы `AudioBuffer` всех прослушанных треков остались бы
   *    замороженными в памяти приложения навсегда, так как Garbage Collector не может удалить их
   *    при наличии живых ссылок внутри синглтон-сервиса `MapLogic`.
   * 3. Безопасность рантайма: Сброс реактивных сигналов в `null` гарантирует, что при повторном
   *    открытии этой страницы плеер стартует с чистого, предсказуемого состояния (без зависших ID треков).
   *
   * NOTE: метод engine.inject(MapLogic) возвращает стабильную ссылку на синглтон-сервис,
   * которая никогда не меняется на протяжении всей жизни приложения. Поскольку ссылка logic стабильна,
   * сам хук useEffect при обычном изменении реактивных сигналов и рендерах компонента
   * выполняться повторно не будет.
   *
   * Соответственно, cleanup-функция (блок return () => { logic.destroy() })
   * выполнится ровно один раз — в момент полного размонтирования (Unmount) React-компонента с экрана.
   * В этих случаях:
   * - Переключение страниц / вкладок (Routing)
   * - Условный рендеринг (Conditional Rendering) в родителе
   * - Горячая перезагрузка при разработке (Vite Hot Reload / Fast Refresh)
   *
   * Таким образом, массив зависимостей [logic] здесь играет роль предохранителя,
   * который сообщает React: «Следи за сервисом.
   * Пока сервис тот же, ничего не делай.
   * Но если компонент вообще исчезнет из интерфейса — обязательно вызови деструктор плеера»
   */
  useEffect(() => {
    return () => {
      logic.destroy()
    }
  }, [logic])

  const activeTrack = logic.tracks.find(t => t.id === currentTrackId)

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      // style={{ padding: '24px', background: '#1e1e24', borderRadius: '12px', width: '450px' }}
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
