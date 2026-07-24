import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import { MapLogic, Station } from './service.MapLogic'
import clsx from 'clsx'

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)

  const { loading, data: stations, error } = useReactiveValue<{ data: Station[] | null; error: null | Error; loading: boolean }>(logic.stationsResource)
  // Подписываемся на сигнал выбранной АЗС
  const selectedStation = engine.use(logic.selectedStation)

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
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>
        Map Stations (BBox API + Debounce + Clusters)
      </div>

      <div
        ref={mapRef}
        style={{
          width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
          height: '400px',
          borderRadius: '8px',
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>
          {loading
            ? '🟡 Получение АЗС...'
            : stations
              ? `🟢 Найдено АЗС: ${stations.length}`
              : error
                ? '🔴 Ошибка запроса'
                : '⚪'}
        </span>
        {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
      </div>

      {/* Выводим инфо о выбранной АЗС из реактивного стейта под картой */}
      {selectedStation && (
        <div
          style={{
            padding: '16px',
            border: '1px solid lightgray',
            borderRadius: '8px',
          }}>
          <strong style={{ color: '#4caf50' }}>Реактивный выбор:</strong> {selectedStation.title || selectedStation.name} (ID: {selectedStation.id})
        </div>
      )}
    </div>
  )
}
