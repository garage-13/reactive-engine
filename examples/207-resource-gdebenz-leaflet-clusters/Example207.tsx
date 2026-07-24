import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import { MapLogic, Station } from './service.MapLogic'
import clsx from 'clsx'
import { Select } from '~/shared/Select'

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)

  const { loading, data: stations, error } = useReactiveValue<{ data: Station[] | null; error: null | Error; loading: boolean }>(logic.stationsResource)
  const selectedStation = engine.use(logic.selectedStation)
  // Подписываемся на текущий выбранный город для селекта
  const currentCityId = engine.use(logic.currentCityId)

  useEffect(() => {
    if (mapRef.current) {
      logic.initializeMap(mapRef.current)
    }
    return () => {
      logic.destroyMap()
    }
  }, [logic])

  const mapRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>
        Map Stations (BBox API + City Selector)
      </div>

      {/* Селект выбора городов */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="city-select">Выберите город:</label>
        <Select
          id="city-select"
          value={currentCityId}
          onChange={(e) => logic.setCity(e.target.value)}
          variant="outlined" // или "contained"
          colorType="primary" // или "secondary"
        >
          {/* Если нужен пустой первый пункт (unselected state) как в MUI: */}
          {/* <option value="" disabled hidden></option> */}
          {logic.cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Контейнер для карты Leaflet */}
      <div
        ref={mapRef}
        style={{
          width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
          height: '400px',
          borderRadius: '8px',
          zIndex: 1,
        }}
      />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <code>
          {loading
            ? '🟡 Получение АЗС...'
            : stations
              ? `🟢 Найдено АЗС: ${stations.length}`
              : error
                ? '🔴 Ошибка запроса'
                : '⚪'}
        </code>
        {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
      </div>

      {/* Выводим инфо о выбранной АЗС из реактивного стейта под картой */}
      {
        selectedStation && (
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
            // Добавим простой инлайн-эффект подсветки при наведении
            onMouseEnter={(e) => {
              // e.currentTarget.style.borderColor = '#4caf50'
              // e.currentTarget.style.background = '#32323f'
            }}
            onMouseLeave={(e) => {
              // e.currentTarget.style.borderColor = '#3a3a42'
              // e.currentTarget.style.background = '#2a2a35'
            }}
          >
            <b style={{ color: '#4caf50', fontSize: '14px' }}>📍 Реактивный выбор (нажмите для перелета по карте):</b>
            <code>
              ID: {selectedStation.id} | {selectedStation.title || selectedStation.name || 'Noname'} | {selectedStation.lat.toFixed(4)}, {selectedStation.lng.toFixed(4)}
            </code>
          </button>
        )
      }

    </div >
  )
}
