import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import baseClasses from '~/ui.common.module.scss'
import { AbstractService, ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine'
import clsx from 'clsx'

// Описываем структуру АЗС из ответа API
interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

class MapLogic extends AbstractService {
  // Сигнал теперь хранит строку bbox: "south,west,north,east"
  // Стартовый bbox для Крыма (как в вашем curl-примере)
  public bbox = this.engine.signal<string>(
    '44.2097,33.2144,45.8785,34.9832',
    'map:signal:bbox'
  )

  // Ресурс автоматически реагирует на изменение bbox
  public stationsResource = this.engine.resource(
    async (bboxValue, abortSignal) => {
      const url = new URL('/gdebenzin-vite-proxy/api/v1/stations', window.location.origin)
      url.searchParams.append('bbox', bboxValue)

      const res = await fetch(url.toString(), {
        signal: abortSignal,
        headers: {
          'Accept': 'application/json',
        }
      })

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json() as Promise<Station[]>
    },
    this.bbox,
    {
      name: 'map:resource:fetch-stations',
      validateBeforeFetch: (bboxValue) => !!bboxValue,
    }
  )

  public updateBbox(newBbox: string) {
    this.bbox.value = newBbox
  }
}

const engine = new ReactiveEngine()

export const MapExample = () => {
  const logic = engine.inject(MapLogic)
  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  // Реф для хранения активных маркеров, чтобы удалять старые
  const markersRef = useRef<L.Marker[]>([])
  // Реф для хранения таймера дебаунса
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 1. Эффект инициализации карты
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Парсим стартовый bbox, чтобы выставить начальный экран карты
    const [south, west, north, east] = logic.bbox.value.split(',').map(Number)
    const bounds = L.latLngBounds([south, west], [north, east])

    const map = L.map(mapContainerRef.current).fitBounds(bounds)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map)

    mapInstanceRef.current = map

    // Обработчик перемещения с дебаунсом в 300мс
    const handleMapMoveEnd = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(() => {
        const currentBounds = map.getBounds()
        const southWest = currentBounds.getSouthWest()
        const northEast = currentBounds.getNorthEast()

        // Формируем строку в формате URL: south,west,north,east
        const bboxString = [
          southWest.lat.toFixed(6),
          southWest.lng.toFixed(6),
          northEast.lat.toFixed(6),
          northEast.lng.toFixed(6)
        ].join(',')

        logic.updateBbox(bboxString)
      }, 300) // Задержка, пока пользователь не перестанет двигать карту
    };

    map.on('moveend', handleMapMoveEnd)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      map.off('moveend', handleMapMoveEnd)
      map.remove()
      mapInstanceRef.current = null
    }
  }, [logic])

  // 2. Эффект отрисовки маркеров АЗС при изменении данных из ресурса
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !stations || !Array.isArray(stations)) return

    // Очищаем старые маркеры с карты
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    // Добавляем новые маркеры
    stations.forEach((station) => {
      if (!station.lat || !station.lng) return

      const marker = L.marker([station.lat, station.lng])
        .bindPopup(`<b>${station.title || station.name}</b><br>ID: ${station.id}`)
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [stations])

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>
        Map Stations (BBox API + Debounce)
      </div>

      <div
        ref={mapContainerRef}
        style={{
          width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
          height: '400px',
          borderRadius: '8px',
          zIndex: 1,
        }}
      />

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>
          {loading ? '🟡 Получение АЗС...' : stations ? `🟢 Найдено АЗС: ${stations.length}` : error ? '🔴 Ошибка запроса' : '⚪'}
        </span>
        {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
      </div>
    </div>
  )
}
