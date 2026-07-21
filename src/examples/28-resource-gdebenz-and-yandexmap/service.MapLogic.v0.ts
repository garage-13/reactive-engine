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
  bbox: string // south,west,north,east
}

const AVAILABLE_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', bbox: '55.4898,37.3193,56.0095,37.9675' },
  { id: 'spb', name: 'Санкт-Петербург', bbox: '59.7444,29.9142,60.0906,30.6475' },
  { id: 'crimea', name: 'Крым (Симферополь)', bbox: '44.8872,34.0201,45.0245,34.1979' },
  { id: 'krasnodar', name: 'Краснодар', bbox: '44.9602,38.8785,45.1326,39.1235' }
]

export class MapLogic extends BaseREService {
  public cities: City[] = AVAILABLE_CITIES
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')
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

  // Переменные для хранения инстансов Яндекс Карт (v3)
  private map: any = null
  private clusterer: any = null
  private ymaps: any = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private effectCleanup: (() => void) | null = null
  private cityEffectCleanup: (() => void) | null = null

  /**
   * Асинхронное подключение скрипта Яндекс Карт API v3
   *
   See also {@link https://yandex.ru/blog/mapsapi/novye-pravila-dostupa-k-api-kart Новые правила доступа к API Карт (2018 окт)}
   */
  private loadYandexMapsScript(): Promise<any> {
    if ((window as any).ymaps3) return Promise.resolve((window as any).ymaps3)

    return new Promise((resolve, reject) => {
      // Достаем ключ из переменных окружения Vite
      const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY || ''

      const script = document.createElement('script')

      // ВАЖНО: Для v3 URL должен содержать параметр apikey
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${apiKey}`

      script.async = true

      script.onload = async () => {
        const ymaps3 = (window as any).ymaps3
        await ymaps3.ready

        // Загружаем дополнительный модуль кластеризации
        await ymaps3.import('@yandex/ymaps3-clusterer@latest')
        resolve(ymaps3)
      }

      script.onerror = (err) => {
        console.error('Сетевая ошибка загрузки скрипта Яндекс Карт. Проверьте валидность apikey.')
        reject(err)
      }

      document.head.appendChild(script)
    })
  }

  /**
   * Инициализация Яндекс Карты
   */
  public initializeMap = async (container: HTMLDivElement) => {
    if (this.map) return

    try {
      this.ymaps = await this.loadYandexMapsScript()
      const [south, west, north, east] = this.bbox.value.split(',').map(Number)

      // В API v3 для задания области используется объект bounds (координаты углов [lng, lat])
      const initialBounds: [[number, number], [number, number]] = [
        [west, south], // Юго-запад [lng, lat]
        [east, north]  // Северо-восток [lng, lat]
      ]

      // Инициализируем карту
      this.map = new this.ymaps.YMap(container, {
        location: { bounds: initialBounds, zoom: 11 },
        showScaleInCopyrights: true
      })

      // Добавляем слой дефолтных тайлов (спутник/схема)
      this.map.addChild(new this.ymaps.YMapDefaultSchemeLayer({}))
      this.map.addChild(new this.ymaps.YMapDefaultFeaturesLayer({}))

      // Инициализируем кластеризатор из загруженного модуля
      const { YMapClusterer } = await this.ymaps.import('@yandex/ymaps3-clusterer@latest')

      // Настройка сетки кластеризации и кастомных маркеров
      this.clusterer = new YMapClusterer({
        method: 'grid',
        gridSize: 64,
        features: [],
        // Функция рендеринга обычного маркера
        marker: (feature: any) => {
          const markerElement = document.createElement('div')
          markerElement.style.width = '24px'
          markerElement.style.height = '24px'
          markerElement.style.background = '#4caf50'
          markerElement.style.borderRadius = '50%'
          markerElement.style.border = '2px solid white'
          markerElement.style.cursor = 'pointer'

          const station: Station = feature.properties.station

          // Добавляем всплывающее окно (попап) средствами Яндекс Карт через листенер
          markerElement.addEventListener('click', () => {
            const popup = new this.ymaps.YMapPopup({
              coordinates: feature.geometry.coordinates,
              content: this.ui.createHtmlContent(station),
              position: 'top center'
            })
            this.map.addChild(popup)
          })

          return new this.ymaps.YMapMarker({ coordinates: feature.geometry.coordinates }, markerElement)
        },
        // Функция рендеринга самого кластера (кружка с цифрой)
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

      // Подписываемся на события изменения камеры (аналог moveend)
      this.map.listener.on('actionend', this.handleMapMoveEnd)
      container.addEventListener('click', this.handlePopupLayerClick)

      // Реактивный эффект для синхронизации маркеров
      if (!this.effectCleanup) {
        this.effectCleanup = this.engine.effect(() => {
          this.renderMarkers(this.stationsResource.data)
        }, 'map:effect:sync-markers')
      } else {
        this.renderMarkers(this.stationsResource.data)
      }

      // Реактивный эффект для перемещения камеры при смене города
      if (!this.cityEffectCleanup) {
        this.cityEffectCleanup = this.engine.effect(() => {
          const currentBbox = this.bbox.value
          if (!this.map) return

          const [south, west, north, east] = currentBbox.split(',').map(Number)
          this.map.update({
            location: {
              bounds: [[west, south], [east, north]],
              duration: 800 // Анимация перелета
            }
          })
        }, 'map:effect:sync-city-view')
      }

    } catch (e) {
      console.error('Ошибка инициализации Яндекс Карт:', e)
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
    this.map.update({
      location: {
        center: [station.lng, station.lat], // В Яндексе формат [lng, lat]!
        zoom: 15,
        duration: 800
      }
    })
  }

  private renderMarkers(stations: Station[] | null) {
    if (!this.clusterer || !stations || !Array.isArray(stations)) return

    // Переводим массив АЗС в GeoJSON-подобный формат features для YMapClusterer
    const features = stations
      .filter(station => station.lat && station.lng)
      .map(station => ({
        type: 'Feature' as const,
        id: String(station.id),
        geometry: {
          type: 'Point' as const,
          coordinates: [station.lng, station.lat] // [lng, lat]
        },
        properties: {
          station // Прокидываем объект станции внутрь свойств фичи
        }
      }))

    // Массово обновляем данные в кластеризаторе
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
      // Достаем новые границы видимости из инстанса Яндекс Карты
      const bounds = this.map.bounds
      if (!bounds) return

      const [[west, south], [east, north]] = bounds

      this.bbox.value = [
        south.toFixed(6),
        west.toFixed(6),
        north.toFixed(6),
        east.toFixed(6)
      ].join(',')
    }, 300)
  }
}
