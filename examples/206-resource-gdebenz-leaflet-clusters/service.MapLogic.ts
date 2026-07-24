import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { AbstractService } from '@pravosleva/reactive-engine'
import { MapUiService } from './service.MapUiService'

export interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

export class MapLogic extends AbstractService {
  public bbox = this.createSignal<string>('44.2097,33.2144,45.8785,34.9832', 'map:signal:bbox')
  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')

  // Внедряем UI-сервис через DI движка
  private ui = this.engine.inject(MapUiService)

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
      name: 'map:resource:fetch-stations',
      validateBeforeFetch: (bboxValue) => !!bboxValue
    }
  )

  private map: L.Map | null = null
  private clusterGroup: L.MarkerClusterGroup | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private effectCleanup: (() => void) | null = null

  // МЕТОД onInit() ПОЛНОСТЬЮ УДАЛЕН, ЧТОБЫ ИЗБЕЖАТЬ ОШИБОК ИНИЦИАЛИЗАЦИИ

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
    container.addEventListener('click', this.handlePopupLayerClick)

    // Инициализируем реактивный эффект ЗДЕСЬ, когда все свойства класса точно готовы
    if (!this.effectCleanup) {
      this.effectCleanup = this.engine.effect(() => {
        this.renderMarkers(this.stationsResource.data)
      }, 'map:effect:sync-markers')
    } else {
      this.renderMarkers(this.stationsResource.data)
    }
  }

  /**
   * Очистка карты при размонтировании
   */
  public destroyMap = () => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

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
        const popupHtml = this.ui.createHtmlContent(station)
        const popupClassName = this.ui.getPopupClassName()

        return L.marker([station.lat, station.lng])
          .bindPopup(popupHtml, {
            className: popupClassName,
            maxWidth: 250
          })
      })

    this.clusterGroup.addLayers(newMarkers)
  }

  private handlePopupLayerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement

    if (this.ui.isSelectButton(target)) {
      const stationId = Number(target.getAttribute('data-station-id'))
      const foundStation = this.stationsResource.data?.find(s => s.id === stationId)
      if (foundStation) {
        this.selectedStation.value = foundStation
      }
    }
  }

  private handleMapMoveEnd = () => {
    if (!this.map) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (!this.map) return
      const currentBounds = this.map.getBounds()
      const southWest = currentBounds.getSouthWest()
      const northEast = currentBounds.getNorthEast()

      this.bbox.value = [
        southWest.lat.toFixed(6),
        southWest.lng.toFixed(6),
        northEast.lat.toFixed(6),
        northEast.lng.toFixed(6)
      ].join(',')
    }, 300)
  }
}
