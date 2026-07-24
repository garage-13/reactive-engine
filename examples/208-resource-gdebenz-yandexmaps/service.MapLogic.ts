import { AbstractService } from '@pravosleva/reactive-engine'
import { MapUiService } from './service.MapUiService'
import { YandexMapsLoaderService } from './service.YandexMapsLoaderService' // Инжектируем новый сервис

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

export class MapLogic extends AbstractService {
  public cities: City[] = AVAILABLE_CITIES
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')
  public bbox = this.createSignal<string>(AVAILABLE_CITIES[0].bbox, 'map:signal:bbox')
  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')

  // Использование DI для получения сервисов
  private ui = this.engine.inject(MapUiService)
  public loader = this.engine.inject(YandexMapsLoaderService)

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

  private map: any = null
  private clusterer: any = null
  private ymaps: any = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private effectCleanup: (() => void) | null = null
  private cityEffectCleanup: (() => void) | null = null
  private lastContainer: HTMLDivElement | null = null

  /**
   * Инициализация карты
   */
  public initializeMap = async (container: HTMLDivElement) => {
    this.lastContainer = container

    // Регистрируем триггер: если ключа нет, но пользователь его введёт — карта автоматически попробует стартовать заново
    this.loader.registerInitTrigger(() => {
      if (this.lastContainer) this.initializeMap(this.lastContainer)
    })

    if (this.map || this.loader.isKeyMissing.value) return

    try {
      // Запрашиваем инстанс ymaps через изолированный сервис загрузки
      this.ymaps = await this.loader.loadScript()

      const [south, west, north, east] = this.bbox.value.split(',').map(Number)
      const initialBounds: [[number, number], [number, number]] = [[west, south], [east, north]]

      this.map = new this.ymaps.YMap(container, {
        location: { bounds: initialBounds, zoom: 11 }
      })

      this.map.addChild(new this.ymaps.YMapDefaultSchemeLayer({}))
      this.map.addChild(new this.ymaps.YMapDefaultFeaturesLayer({}))

      const { YMapClusterer } = await this.ymaps.import('@yandex/ymaps3-clusterer@latest')

      this.clusterer = new YMapClusterer({
        method: 'grid',
        gridSize: 64,
        features: [],
        marker: (feature: any) => {
          const markerElement = document.createElement('div')
          markerElement.style.width = '24px'
          markerElement.style.height = '24px'
          markerElement.style.background = '#4caf50'
          markerElement.style.borderRadius = '50%'
          markerElement.style.border = '2px solid white'
          markerElement.style.cursor = 'pointer'

          markerElement.addEventListener('click', () => {
            const popup = new this.ymaps.YMapPopup({
              coordinates: feature.geometry.coordinates,
              content: this.ui.createHtmlContent(feature.properties.station),
              position: 'top center'
            })
            this.map.addChild(popup)
          })

          return new this.ymaps.YMapMarker({ coordinates: feature.geometry.coordinates }, markerElement)
        },
        cluster: (cluster: any) => {
          const clusterElement = document.createElement('div')
          clusterElement.style.width = '32px'
          clusterElement.style.height = '32px'
          clusterElement.style.background = '#2196f3'
          clusterElement.style.color = 'white'
          clusterElement.style.borderRadius = '50%'
          clusterElement.style.display = 'flex'
          clusterElement.style.alignItems = 'center'
          clusterElement.style.justifyContent = 'center'
          clusterElement.style.fontWeight = 'bold'
          clusterElement.innerText = cluster.features.length

          return new this.ymaps.YMapMarker({ coordinates: cluster.geometry.coordinates }, clusterElement)
        }
      })

      this.map.addChild(this.clusterer)

      this.map.listener.on('actionend', this.handleMapMoveEnd)
      container.addEventListener('click', this.handlePopupLayerClick)

      if (!this.effectCleanup) {
        this.effectCleanup = this.engine.effect(() => {
          this.renderMarkers(this.stationsResource.data)
        }, 'map:effect:sync-markers')
      } else {
        this.renderMarkers(this.stationsResource.data)
      }

      if (!this.cityEffectCleanup) {
        this.cityEffectCleanup = this.engine.effect(() => {
          const currentBbox = this.bbox.value
          if (!this.map) return
          const [south, west, north, east] = currentBbox.split(',').map(Number)
          this.map.update({ location: { bounds: [[west, south], [east, north]], duration: 800 } })
        }, 'map:effect:sync-city-view')
      }

    } catch (e) {
      console.error('Критическая ошибка инициализации инфраструктуры карты:', e)
    }
  }

  public destroyMap = () => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.effectCleanup) { this.effectCleanup(); this.effectCleanup = null; }
    if (this.cityEffectCleanup) { this.cityEffectCleanup(); this.cityEffectCleanup = null; }
    if (this.map) {
      this.map.destroy()
    }
    this.map = null
    this.clusterer = null
    this.lastContainer = null
  }

  public setCity = (cityId: string) => {
    const foundCity = this.cities.find(c => c.id === cityId)
    if (foundCity) {
      this.currentCityId.value = cityId
      this.bbox.value = foundCity.bbox
    }
  }

  public focusOnStation = (station: Station) => {
    if (!this.map || !station.lat || !station.lng) return
    this.map.update({ location: { center: [station.lng, station.lat], zoom: 15, duration: 800 } })
  }

  private renderMarkers(stations: Station[] | null) {
    if (!this.clusterer || !stations || !Array.isArray(stations)) return
    const features = stations
      .filter(station => station.lat && station.lng)
      .map(station => ({
        type: 'Feature' as const,
        id: String(station.id),
        geometry: { type: 'Point' as const, coordinates: [station.lng, station.lat] },
        properties: { station }
      }))
    this.clusterer.update({ features })
  }

  private handlePopupLayerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (this.ui.isSelectButton(target)) {
      const stationId = Number(target.getAttribute('data-station-id'))
      const foundStation = this.stationsResource.data?.find(s => s.id === stationId)
      if (foundStation) this.selectedStation.value = foundStation
    }
  }

  private handleMapMoveEnd = () => {
    if (!this.map) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (!this.map) return
      const bounds = this.map.bounds
      if (!bounds) return
      const [[west, south], [east, north]] = bounds
      this.bbox.value = [south.toFixed(6), west.toFixed(6), north.toFixed(6), east.toFixed(6)].join(',')
    }, 300)
  }
}
