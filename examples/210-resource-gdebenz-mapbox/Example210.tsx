import { useEffect, useRef, useState } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import { MapLogic } from './service.MapLogic'
import { Select } from '~/shared/Select'
import { Input } from '~/shared/Input'
import clsx from 'clsx'
import 'mapbox-gl/dist/mapbox-gl.css'
import './MapExample.module.scss'

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)
  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)
  const selectedStation = engine.use(logic.selectedStation)
  const currentCityId = engine.use(logic.currentCityId)

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
        Mapbox GL JS Integration (Reactive Engine)
      </div>

      {isKeyMissing ? (
        <div style={{ padding: '24px', background: '#222227', borderRadius: '8px', textAlign: 'center', width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)' }}>
          <h3 style={{ color: '#1a73e8', margin: '0 0 8px 0' }}>
            Работа с Mapbox невозможна
          </h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
            Для отрисовки карты требуется обязательный токен доступа Mapbox API.<br />
            Пожалуйста, введите его ниже:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <Input
              type="text"
              placeholder="Вставьте Mapbox Access Token"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
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
          {!loadError && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor="city-select">Выберите город:</label>
              <Select
                id="city-select"
                value={currentCityId}
                onChange={(e) => logic.setCity(e.target.value)}
                variant="outlined"
                colorType="primary"
              >
                {logic.cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {loadError ? (
            <div style={{ width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)', padding: '16px', background: '#1a1a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350', borderRadius: '8px', border: '1px solid #ef5350', flexDirection: 'column', gap: '12px' }}>
              <span>❌ {loadError}</span>
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
            border: '2px solid lightgray',
            borderRadius: '8px',
            width: '100%',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <b style={{ color: '#4caf50', fontSize: '14px' }}>📍 Реактивный выбор (нажмите для перелета по карте):</b>
          <code>
            ID: {selectedStation.id} | {selectedStation.title || selectedStation.name || 'Noname'} | {selectedStation.lat.toFixed(4)}, {selectedStation.lng.toFixed(4)}
          </code>
        </button>
      )}
    </div>
  )
}
