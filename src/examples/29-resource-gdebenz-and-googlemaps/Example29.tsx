import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MapLogic } from './service.MapLogic'
import baseClasses from '../baseClasses.common.module.scss'
import btnClasses from '../baseClasses.buttons.module.scss'
import { ReactiveEngine } from '../../core'
import { useReactiveValue } from '../../hooks'
// import './fix-googlemaps-exp.css'

const engine = new ReactiveEngine()

export const MapExample = () => {
  /**
   * Инжектированный инстанс бизнес-сервиса управления картой.
   *
   * Через механизм Dependency Injection (DI) движка `ReactiveEngine` компонент получает
   * единый синглтон-сервис `MapLogic`. Этот сервис инкапсулирует в себе всю императивную
   * работу с Google Maps API v3, управление сетевым ресурсом АЗС и синхронизацию
   * географических координат.
   *
   * Использование `engine.inject` гарантирует изолированность бизнес-логики от жизненного
   * цикла React и позволяет тестировать картографию независимо от слоя представления (UI).
   *
   * @type {MapLogic}
   */
  const logic: MapLogic = engine.inject(MapLogic)

  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)
  const selectedStation = engine.use(logic.selectedStation)
  const currentCityId = engine.use(logic.currentCityId)

  // Читаем реактивное состояние прямо из инжектированного загрузчика Google Maps
  const isKeyMissing = engine.use(logic.loader.isKeyMissing)
  const loadError = engine.use(logic.loader.loadError)

  const [inputKey, setInputKey] = useState('')
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mapRef.current) {
      logic.initializeMap(mapRef.current)
    }
    return () => {
      logic.destroyMap()
    }
  }, [logic, isKeyMissing])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>
        Google Maps API (Dynamic Loader + Clusters + Reactive state)
      </div>

      {isKeyMissing ? (
        <div style={{ padding: '24px', background: '#222227', borderRadius: '8px', textAlign: 'center', width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)' }}>
          <h3 style={{ color: '#1a73e8', margin: '0 0 8px 0' }}>
            Работа с Google Maps невозможна
          </h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
            Для отрисовки карты требуется обязательный API-ключ Google Maps JavaScript API.<br />
            Пожалуйста, введите его ниже:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <input
              type="text"
              placeholder="Вставьте Google API_KEY"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              style={{ padding: '8px 12px', width: '300px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '6px' }}
            />
            <button
              onClick={() => logic.loader.submitApiKey(inputKey)}
              className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
            >
              Активировать
            </button>
          </div>
        </div>
      ) : (
        <>
          {
            !loadError && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label htmlFor="city-select">Выберите город:</label>
                <select
                  id="city-select"
                  value={currentCityId}
                  onChange={(e) => logic.setCity(e.target.value)}
                  style={{ padding: '6px 12px', background: '#1e1e24', color: '#fff', border: '1px solid #3a3a42', borderRadius: '6px', cursor: 'pointer' }}
                >
                  {logic.cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>
            )
          }

          {loadError ? (
            <div
              style={{ width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)', padding: '16px', background: '#1a1a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350', borderRadius: '8px', flexDirection: 'column', gap: '12px' }}
            >
              <span style={{ textAlign: 'center' }}>❌ {loadError}</span>
              <button onClick={() => logic.loader.reset()} style={{ background: 'transparent', color: '#2196f3', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Ввести другой ключ
              </button>
            </div>
          ) : (
            <div
              ref={mapRef}
              style={{ width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)', height: '400px', borderRadius: '8px', zIndex: 1 }}
            />
          )}
        </>
      )}

      {!isKeyMissing && !loadError && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>
            {loading ? '🟡 Получение АЗС...' : stations ? `🟢 Найдено АЗС: ${stations.length}` : error ? '🔴 Ошибка запроса' : '⚪'}
          </span>
          {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
        </div>
      )}

      {selectedStation && (
        <button
          onClick={() => logic.focusOnStation(selectedStation)}
          style={{
            padding: '16px',
            border: '1px solid lightgray',
            borderRadius: '8px',
            textAlign: 'left',
          }}>
          <strong style={{ color: '#4caf50' }}>Реактивный выбор:</strong>
          <br />
          {selectedStation.title || selectedStation.name} (ID: {selectedStation.id})
        </button>
      )}
    </div>
  )
}
