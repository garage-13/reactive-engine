import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { AbstractService, withDebounce, withStaleWhileRevalidate } from '@pravosleva/reactive-engine'

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
    withDebounce(
      withStaleWhileRevalidate(
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
        { initialData: [] }
      ),
      { delay: 500 }
    ),
    this.bbox,
    {
      name: 'map:resource:fetch-stations',
      validateBeforeFetch: (bboxValue) => !!bboxValue,
    }
  )

  private validStationsSignal = this.createSignal<Station[]>([], 'map:signal:valid-stations')
  private markerCache = new Map<number, L.Marker>()
  private displayedMarkers = new Set<L.Marker>()

  /**
   * ID станции, чей попап сейчас открыт.
   * Позволяет синхронизировать состояние попапа независимо от DOM-дерева Leaflet.
   */
  public activeStationId = this.createSignal<number | null>(null, 'map:signal:active-station-id')

  private map: L.Map | null = null
  private clusterGroup: L.MarkerClusterGroup | null = null
  private effectCleanup: (() => void) | null = null
  private globalPopup: L.Popup | null = null

  public markers = this.engine.computed<L.Marker[]>(() => {
    const stations = this.validStationsSignal.value

    const currentIds = new Set(stations.map(s => s.id))
    for (const cachedId of this.markerCache.keys()) {
      if (!currentIds.has(cachedId)) {
        this.markerCache.delete(cachedId)
      }
    }

    return stations
      .filter(station => station.lat && station.lng)
      .map(station => {
        if (this.markerCache.has(station.id)) {
          return this.markerCache.get(station.id)!
        }

        // Мы НЕ вызываем .bindPopup() на самом маркере.
        // Маркер остается «чистым» для плагина кластеризации, что исключает любые Race Conditions.
        const newMarker = L.marker([station.lat, station.lng])

        // Перехватываем клик по маркеру
        newMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          this.openGlobalPopupForStation(station)
        })

        this.markerCache.set(station.id, newMarker)
        return newMarker
      })
  }, 'map:computed:markers')

  public initializeMap = (container: HTMLDivElement) => {
    if (this.map) return

    const [south, west, north, east] = this.bbox.value.split(',').map(Number)
    const bounds = L.latLngBounds([south, west], [north, east])

    this.map = L.map(container).fitBounds(bounds)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map)

    // Создаем независимый инстанс глобального попапа
    this.globalPopup = L.popup({
      autoClose: false,
      closeOnClick: false
    })

    // Следим за тем, когда пользователь закрывает попап крестиком
    this.map.on('popupclose', (e) => {
      if (e.popup === this.globalPopup) {
        this.activeStationId.value = null
      }
    })

    this.clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      animate: true,
      chunkedLoading: true
    })

    // Перехватываем клики по маркерам, даже когда они находятся внутри нераскрытых кластеров
    this.clusterGroup.on('click', (a) => {
      const marker = a.layer as L.Marker
      // Ищем станцию по координатам маркера в кэше
      for (const [id, cachedMarker] of this.markerCache.entries()) {
        if (cachedMarker === marker) {
          const stations = this.validStationsSignal.value
          const targetStation = stations.find(s => s.id === id)
          if (targetStation) {
            this.openGlobalPopupForStation(targetStation)
          }
          break
        }
      }
    })

    this.map.addLayer(this.clusterGroup)
    this.map.on('moveend', this.handleMapMoveEnd)

    this.engine.effect(() => {
      const resData = this.stationsResource.data
      if (resData && Array.isArray(resData)) {
        this.validStationsSignal.value = resData
      }
    }, 'map:effect:sync-resource-to-signal')

    if (!this.effectCleanup) {
      this.effectCleanup = this.engine.effect(() => {
        this.syncClusterLayers(this.markers.value)
      }, 'map:effect:sync-markers')
    } else {
      this.syncClusterLayers(this.markers.value)
    }

    // Реактивный эффект для удержания попапа на карте при обновлении данных
    this.engine.effect(() => {
      const activeId = this.activeStationId.value
      if (!activeId || !this.map || !this.globalPopup) return

      const stations = this.validStationsSignal.value
      const currentActiveStation = stations.find(s => s.id === activeId)

      // Если станция всё еще есть в активном bbox — гарантируем, что попап открыт
      if (currentActiveStation) {
        this.globalPopup
          .setLatLng([currentActiveStation.lat, currentActiveStation.lng || currentActiveStation.lng])
          .setContent(`<b>${currentActiveStation.title || currentActiveStation.name}</b><br>ID: ${currentActiveStation.id}`)

        if (!this.map.hasLayer(this.globalPopup)) {
          this.globalPopup.addTo(this.map)
        }
      }
    }, 'map:effect:keep-popup-alive')
  }

  // Логика открытия глобального независимого попапа
  private openGlobalPopupForStation(station: Station) {
    if (!this.map || !this.globalPopup) return

    this.activeStationId.value = station.id

    this.globalPopup
      .setLatLng([station.lat, station.lng])
      .setContent(`<b>${station.title || station.name}</b><br>ID: ${station.id}`)
      .openOn(this.map)
  }

  public destroyMap = () => {
    if (this.effectCleanup) {
      this.effectCleanup()
      this.effectCleanup = null
    }

    if (this.map) {
      if (this.clusterGroup) this.clusterGroup.off('click')
      this.map.off('popupclose')
      this.map.off('moveend', this.handleMapMoveEnd)
      this.map.remove()
    }
    this.map = null
    this.clusterGroup = null
    this.globalPopup = null
    this.markerCache.clear()
    this.displayedMarkers.clear()
    this.validStationsSignal.value = []
    this.activeStationId.value = null
  }

  // Чистый, стандартный метод синхронизации слоев без костылей с вырезанием маркеров
  private syncClusterLayers(nextMarkers: L.Marker[]) {
    if (!this.clusterGroup || !this.map) return

    const nextMarkersSet = new Set(nextMarkers)
    const toAdd: L.Marker[] = []
    const toRemove: L.Marker[] = []

    for (const marker of this.displayedMarkers) {
      if (!nextMarkersSet.has(marker)) toRemove.push(marker)
    }

    for (const marker of nextMarkers) {
      if (!this.displayedMarkers.has(marker)) toAdd.push(marker)
    }

    if (toRemove.length > 0) {
      this.clusterGroup.removeLayers(toRemove)
      toRemove.forEach(m => this.displayedMarkers.delete(m))
    }

    if (toAdd.length > 0) {
      this.clusterGroup.addLayers(toAdd)
      toAdd.forEach(m => this.displayedMarkers.add(m))
    }
  }

  private handleMapMoveEnd = () => {
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
  }
}
