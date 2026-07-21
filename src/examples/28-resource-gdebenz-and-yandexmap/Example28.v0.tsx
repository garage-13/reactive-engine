import { useEffect, useRef } from 'react'
import baseClasses from '../baseClasses.common.module.scss'
import { ReactiveEngine } from '../../core'
import { MapLogic } from './service.MapLogic.v0'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)

  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)
  const selectedStation = engine.use(logic.selectedStation)
  const currentCityId = engine.use(logic.currentCityId)

  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mapRef.current) {
      logic.initializeMap(mapRef.current)
    }
    return () => {
      logic.destroyMap()
    }
  }, [logic])

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>
        Yandex Maps v3 API Integration
      </div>

      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <label htmlFor="city-select" style={{ fontSize: '14px', color: '#ccc' }}>Выберите город:</label>
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

      {/* Контейнер для Яндекс Карты */}
      <div
        ref={mapRef}
        style={{ width: 'calc(100vw - 80px)', height: '400px', borderRadius: '8px', zIndex: 1 }}
      />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>
          {loading ? '🟡 Получение АЗС...' : stations ? `🟢 Найдено АЗС: ${stations.length}` : error ? '🔴 Ошибка запроса' : '⚪'}
        </span>
        {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
      </div>

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
