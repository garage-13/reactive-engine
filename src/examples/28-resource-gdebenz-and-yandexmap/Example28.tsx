import { useEffect, useRef, useState } from 'react'
import baseClasses from '../baseClasses.common.module.scss'
import btnClasses from '../baseClasses.buttons.module.scss'
import { ReactiveEngine } from '../../core'
import { MapLogic } from './service.MapLogic'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)

  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)
  const selectedStation = engine.use(logic.selectedStation)
  const currentCityId = engine.use(logic.currentCityId)

  // Достаем реактивные сигналы напрямую из инжектированного Loader-сервиса
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
        Yandex Maps v3 (Clean DI Architecture)
      </div>

      {isKeyMissing ? (
        <div
          style={{
            padding: '24px',
            background: '#222227',
            borderRadius: '8px',
            textAlign: 'center',
            width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
          }}
        >
          <h3 style={{ color: '#ef5350', margin: '0 0 8px 0' }}>
            Работа с Яндекс Картами невозможна
          </h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
            Для отрисовки API v3 требуется обязательный API-ключ JavaScript API.<br />
            Пожалуйста, введите его ниже:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <input
              type="text"
              placeholder="Вставьте API_KEY"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              style={{ padding: '8px 12px', width: '300px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '6px' }}
            />
            <button
              onClick={() => logic.loader.submitApiKey(inputKey)} // Передали вызов в loader-сервис
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
                  style={{
                    padding: '6px 12px',
                    background: '#1e1e24',
                    color: '#fff',
                    border: '1px solid #3a3a42',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {logic.cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          }

          {loadError ? (
            <div
              style={{
                width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
                // height: '400px',
                background: '#1a1a1f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef5350',
                borderRadius: '8px',
                // border: '1px solid #ef5350',
                flexDirection: 'column',
                gap: '8px',
                padding: '16px',
              }}>
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
          style={{ marginTop: '12px', padding: '12px 16px', background: '#2a2a35', border: '1px solid #3a3a42', borderRadius: '8px', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          <strong style={{ color: '#4caf50', fontSize: '14px' }}>📍 Выбор в Яндекс Картах (нажмите для перелета):</strong>
          <span style={{ color: '#fff', fontSize: '15px' }}>{selectedStation.title || selectedStation.name}</span>
        </button>
      )}
    </div>
  )
}
