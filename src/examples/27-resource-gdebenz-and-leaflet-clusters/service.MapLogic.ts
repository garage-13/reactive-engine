import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { BaseREService } from '../../BaseREService'
import { MapUiService } from './service.MapUiService'

export interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

export interface City {
  id: string
  name: string
  bbox: string
}

const AVAILABLE_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', bbox: '55.4898,37.3193,56.0095,37.9675' },
  { id: 'spb', name: 'Санкт-Петербург', bbox: '59.7444,29.9142,60.0906,30.6475' },
  { id: 'crimea', name: 'Крым (Симферополь)', bbox: '44.8872,34.0201,45.0245,34.1979' },
  { id: 'krasnodar', name: 'Краснодар', bbox: '44.9602,38.8785,45.1326,39.1235' }
]

export class MapLogic extends BaseREService {
  public cities: City[] = AVAILABLE_CITIES

  // Сигнал для синхронизации выпадающего списка в UI
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')

  // ТЕПЕРЬ ЭТО ОБЫЧНЫЙ СИГНАЛ. Инициализируем дефолтным значением Москвы
  public bbox = this.createSignal<string>(AVAILABLE_CITIES[0].bbox, 'map:signal:bbox')

  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')
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
    { name: 'map:resource:fetch-stations', validateBeforeFetch: (bboxValue) => !!bboxValue }
  )

  private map: L.Map | null = null
  private clusterGroup: L.MarkerClusterGroup | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private effectCleanup: (() => void) | null = null
  private cityEffectCleanup: (() => void) | null = null

  public initializeMap = (container: HTMLDivElement) => {
    if (this.map) return

    // Берем текущее значение сигнала bbox (какой бы город там ни был выбран на момент монтирования)
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

    // Эффект 1: Синхронизация маркеров АЗС
    if (!this.effectCleanup) {
      this.effectCleanup = this.engine.effect(() => {
        this.renderMarkers(this.stationsResource.data)
      }, 'map:effect:sync-markers')
    } else {
      this.renderMarkers(this.stationsResource.data)
    }

    // Эффект 2: Следим за сигналом bbox. Если он поменялся ИЗВНЕ (через метод setCity), плавно двигаем карту
    if (!this.cityEffectCleanup) {
      this.cityEffectCleanup = this.engine.effect(() => {
        const currentBbox = this.bbox.value
        if (!this.map) return

        const [south, west, north, east] = currentBbox.split(',').map(Number)
        const targetBounds = L.latLngBounds([south, west], [north, east])

        // Перемещаем карту только если новые границы визуально отличаются от текущих
        // (это предотвращает зацикливание при ручном перетаскивании)
        if (!this.map.getBounds().pad(0.05).contains(targetBounds)) {
          this.map.fitBounds(targetBounds)
        }
      }, 'map:effect:sync-city-view')
    }
  }

  public destroyMap = () => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.effectCleanup) { this.effectCleanup(); this.effectCleanup = null; }
    if (this.cityEffectCleanup) { this.cityEffectCleanup(); this.cityEffectCleanup = null; }
    if (this.map) {
      this.map.off('moveend', this.handleMapMoveEnd)
      this.map.remove()
    }
    this.map = null
    this.clusterGroup = null
  }

  /**
   * Метод переключения города из UI селекта
   */
  public setCity = (cityId: string) => {
    const foundCity = this.cities.find(c => c.id === cityId)
    if (foundCity) {
      // 1. Обновляем ID текущего города для селекта
      this.currentCityId.value = cityId
      // 2. Записываем новые дефолтные координаты города в сигнал bbox -> сработает триггер на fetch и на перемещение карты
      this.bbox.value = foundCity.bbox
    }
  }

  private renderMarkers(stations: Station[] | null) {
    if (!this.clusterGroup || !stations || !Array.isArray(stations)) return
    this.clusterGroup.clearLayers()

    const newMarkers = stations
      .filter(station => station.lat && station.lng)
      .map(station => {
        const popupHtml = this.ui.createHtmlContent(station)
        return L.marker([station.lat, station.lng])
          .bindPopup(popupHtml, { className: this.ui.getPopupClassName(), maxWidth: 250 })
      })

    this.clusterGroup.addLayers(newMarkers)
  }

  private handlePopupLayerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (this.ui.isSelectButton(target)) {
      const stationId = Number(target.getAttribute('data-station-id'))
      const foundStation = this.stationsResource.data?.find(s => s.id === stationId)
      if (foundStation) this.selectedStation.value = foundStation
    }
  }

  /**
   * Срабатывает при ручном перемещении карты пользователем
   */
  private handleMapMoveEnd = () => {
    if (!this.map) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (!this.map) return
      const currentBounds = this.map.getBounds()
      const southWest = currentBounds.getSouthWest()
      const northEast = currentBounds.getNorthEast()

      // ТЕПЕРЬ ПЕРЕЗАПИСЬ СИГНАЛА ПРОХОДИТ БЕЗ ОШИБОК ЯДРА
      this.bbox.value = [
        southWest.lat.toFixed(6),
        southWest.lng.toFixed(6),
        northEast.lat.toFixed(6),
        northEast.lng.toFixed(6)
      ].join(',')
    }, 300)
  }

  /**
   * Плавно центрирует карту на выбранной АЗС с приближением масштаба
   *
   * 1. Вы кликаете по маркеру на карте и нажимаете во всплывающем балуне кнопку «Выбрать АЗС».
   * 2. Событие через делегирование попадает в MapLogic, записывая объект заправки в сигнал selectedStation.
   * 3. Под картой реактивно рендерится стилизованная кнопка-карточка.
   * 4. Вы скроллите карту в любую другую сторону (или вообще переключаете город в селекте).
   * 5. Нажимаете на карточку под картой — срабатывает метод logic.focusOnStation(selectedStation),
   * и Leaflet плавно переносит камеру назад к выбранной заправке, автоматически запуская подгрузку нужного bbox через событие moveend.
   */
  public focusOnStation = (station: Station) => {
    if (!this.map || !station.lat || !station.lng) return

    // Перемещаем карту на координаты АЗС, выставляя детальный масштаб (например, 15)
    this.map.setView([station.lat, station.lng], 15, {
      animate: true,
      duration: 0.8 // Длительность анимации полета в секундах
    })

    // Опционально: можно программно найти маркер этой заправки и открыть её балун.
    // Но базового плавного перемещения setView обычно более чем достаточно.
  }
}
