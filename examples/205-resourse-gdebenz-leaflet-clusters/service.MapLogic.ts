import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { AbstractService } from '@pravosleva/reactive-engine'

export interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

export class MapLogic extends AbstractService {
  public bbox = this.createSignal<string>('44.2097,33.2144,45.8785,34.9832', 'example-205:map:signal:bbox')

  public stationsResource = this.engine.resource(
    async (bboxValue, abortSignal) => {
      const url = new URL('/gdebenzin-vite-proxy/api/v1/stations', window.location.origin)
      url.searchParams.append('bbox', bboxValue)

      const res = await fetch(url.toString(), {
        signal: abortSignal,
        headers: { 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json() as Promise<Station[]>
    },
    this.bbox,
    {
      name: 'example-205:map:resource:fetch-stations',
      validateBeforeFetch: (bboxValue) => !!bboxValue,
    }
  )

  private map: L.Map | null = null
  private clusterGroup: L.MarkerClusterGroup | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Храним функцию очистки эффекта, чтобы удалить её при уничтожении карты
  private effectCleanup: (() => void) | null = null

  /**
   * Инициализация карты из DOM-элемента
   */
  public initializeMap = (container: HTMLDivElement) => {
    if (this.map) return

    const [south, west, north, east] = this.bbox.value.split(',').map(Number)
    const bounds = L.latLngBounds([south, west], [north, east])

    this.map = L.map(container).fitBounds(bounds)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map)

    this.clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    })
    this.map.addLayer(this.clusterGroup)

    this.map.on('moveend', this.handleMapMoveEnd)

    // Создаем реактивный эффект ОДИН раз, когда карта и все свойства класса точно готовы
    if (!this.effectCleanup) {
      this.effectCleanup = this.engine.effect(() => {
        const stations = this.stationsResource.data
        this.renderMarkers(stations)
      }, 'example-205:map:effect:sync-markers')
    } else {
      // Если эффект уже был создан ранее, просто принудительно синхронизируем текущее состояние
      this.renderMarkers(this.stationsResource.data)
    }
  }

  /**
   * Очистка карты при размонтировании
   */
  public destroyMap = () => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    // Уничтожаем реактивный эффект, чтобы он не висел в памяти движка
    if (this.effectCleanup) {
      this.effectCleanup()
      this.effectCleanup = null
    }

    if (this.map) {
      this.map.off('moveend', this.handleMapMoveEnd)
      this.map.remove()
    }
    this.map = null
    this.clusterGroup = null
  }

  private renderMarkers(stations: Station[] | null) {
    if (!this.clusterGroup || !stations || !Array.isArray(stations)) return

    this.clusterGroup.clearLayers()

    const newMarkers = stations
      .filter(station => station.lat && station.lng)
      .map(station => {
        return L.marker([station.lat, station.lng])
          .bindPopup(`<b>${station.title || station.name}</b><br>ID: ${station.id}`)
      })

    this.clusterGroup.addLayers(newMarkers)
  }

  private handleMapMoveEnd = () => {
    if (!this.map) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (!this.map) return
      const currentBounds = this.map.getBounds()
      const southWest = currentBounds.getSouthWest()
      const northEast = currentBounds.getNorthEast()

      const bboxString = [
        southWest.lat.toFixed(6),
        southWest.lng.toFixed(6),
        northEast.lat.toFixed(6),
        northEast.lng.toFixed(6)
      ].join(',')

      this.bbox.value = bboxString
    }, 300)
  }
}
