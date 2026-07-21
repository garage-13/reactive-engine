import { BaseREService } from '../../BaseREService'
import { MapUiService } from './service.MapUiService'
import { GoogleMapsLoaderService } from './service.GoogleMapsLoaderService'
import { MarkerClusterer } from '@googlemaps/markerclusterer'

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
  lat: number
  lng: number
  zoom: number
  bbox: string // Стартовый bbox для инициализации ресурса
}

const AVAILABLE_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173, zoom: 11, bbox: '55.4898,37.3193,56.0095,37.9675' },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351, zoom: 11, bbox: '59.7444,29.9142,60.0906,30.6475' },
  { id: 'crimea', name: 'Крым (Симферополь)', lat: 44.9521, lng: 34.1024, zoom: 11, bbox: '44.8872,34.0201,45.0245,34.1979' },
  { id: 'krasnodar', name: 'Краснодар', lat: 45.0355, lng: 38.9747, zoom: 11, bbox: '44.9602,38.8785,45.1326,39.1235' }
]

export class MapLogic extends BaseREService {
  public cities: City[] = AVAILABLE_CITIES

  // 1. БАЗОВЫЕ РЕАКТИВНЫЕ СИГНАЛЫ (Источники правды)
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')
  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')

  // Географическое состояние карты в сигналах
  public mapCenter = this.createSignal<{ lat: number; lng: number }>({ lat: 55.7558, lng: 37.6173 }, 'map:signal:center')
  public mapZoom = this.createSignal<number>(11, 'map:signal:zoom')

  // Сигнал-блокировщик: сообщает, вызвано ли движение карты программным экшеном
  public isProgrammatic = this.createSignal<boolean>(false, 'map:signal:is-programmatic')

  // Динамический bbox теперь является реактивным COMPUTED свойством
  public bbox = this.createSignal<string>(AVAILABLE_CITIES[0].bbox, 'map:signal:bbox')

  // Инжектируем вспомогательные сервисы через DI
  private ui = this.engine.inject(MapUiService)
  public loader = this.engine.inject(GoogleMapsLoaderService)

  // Реактивный ресурс: автоматически перезапускается при мутации bbox
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

  // Внутренние императивные сущности Google Maps (скрыты от реактивного графа)
  private map: any = null
  private markerClusterer: MarkerClusterer | null = null
  private activeInfoWindow: any = null
  // Свойство класса для хранения ВСЕХ скачанных АЗС за сессию
  private markersMap = new Map<number, { marker: any; station: Station }>()

  // Хранилище для функций очистки реактивных эффектов движка
  private disposers: (() => void)[] = []
  private mapListeners: any[] = []
  private lastContainer: HTMLDivElement | null = null

  /**
   * ИНИЦИАЛИЗАЦИЯ КАРТЫ
   */
  public initializeMap = async (container: HTMLDivElement) => {
    this.lastContainer = container
    this.loader.registerInitTrigger(() => {
      if (this.lastContainer) this.initializeMap(this.lastContainer)
    })

    if (this.map || this.loader.isKeyMissing.value) return

    try {
      const [mapsLib, coreLib] = await Promise.all([
        this.loader.importGoogleLibrary('maps'),
        this.loader.importGoogleLibrary('core')
      ])

      // Создаем карту на основе текущих реактивных сигналов центра и зума
      this.map = new mapsLib.Map(container, {
        center: this.mapCenter.value,
        zoom: this.mapZoom.value,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        disableAutoPan: true // Глобально отключаем дерганье карты от InfoWindow
      })

      this.markerClusterer = new MarkerClusterer({ map: this.map, markers: [] })

      // Подписываемся на окончание ЛЮБОГО движения камеры (ручного или программного)
      const idleListener = this.map.addListener('idle', this.handleMapIdle)
      this.mapListeners.push(idleListener)

      container.addEventListener('click', this.handlePopupLayerClick)

      // СВЯЗЫВАЕМ РЕАКТИВНОСТЬ ДВИЖКА С КАРТОЙ (ЭФФЕКТЫ)
      this.initReactiveEffects()

    } catch (e) {
      console.error('Ошибка инициализации Google Maps:', e)
    }
  }

  /**
   * РЕАКТИВНЫЕ ЭФФЕКТЫ ДВИЖКА (Вся магия синхронизации здесь)
   */
  private initReactiveEffects() {
    this.cleanupEffects()

    // Эффект 1: Синхронизация маркеров при обновлении ресурса
    const markersDisposer = this.engine.effect(() => {
      this.renderMarkers(this.stationsResource.data)
    }, 'map:effect:sync-markers')
    this.disposers.push(markersDisposer)

    // Эффект 2: Реактивный перелёт камеры
    const cameraDisposer = this.engine.effect(() => {
      const center = this.mapCenter.value
      const zoom = this.mapZoom.value
      const programmatic = this.isProgrammatic.value

      if (!this.map) return

      if (programmatic) {
        this.map.setCenter(center)
        this.map.setZoom(zoom)

        this.isProgrammatic.value = false
      }
    }, 'map:effect:sync-camera')
    this.disposers.push(cameraDisposer)
  }

  /**
 * Полная очистка при уничтожении компонента
 */
  public destroyMap = () => {
    // if (this.debounceTimer) clearTimeout(this.debounceTimer)
    // if (this.markersCleanup) { this.markersCleanup(); this.markersCleanup = null; }
    // if (this.cityEffectCleanup) { this.cityEffectCleanup(); this.cityEffectCleanup = null; }

    const globalContext: any = window
    if (globalContext.google?.maps?.event) {
      this.mapListeners.forEach(listener => globalContext.google.maps.event.removeListener(listener))
    }
    this.mapListeners = []

    // Вычищаем маркеры из памяти Google Maps
    if (this.markerClusterer) {
      this.markerClusterer.clearMarkers()
    }
    if (this.activeInfoWindow) {
      this.activeInfoWindow.close()
    }

    this.markersMap.forEach(({ marker }) => marker.setMap(null))
    this.markersMap.clear()

    this.map = null
    this.markerClusterer = null
    this.activeInfoWindow = null
    this.lastContainer = null
  }

  private cleanupEffects() {
    this.disposers.forEach(dispose => dispose())
    this.disposers = []
  }

  /**
   * ЭКШЕН: Выбор города. Просто обновляет реактивные сигналы!
   */
  public setCity = (cityId: string) => {
    const foundCity = this.cities.find(c => c.id === cityId)
    if (!foundCity) return

    this.currentCityId.value = cityId

    // Взводим реактивное состояние программного перемещения
    this.isProgrammatic.value = true
    this.mapCenter.value = { lat: foundCity.lat, lng: foundCity.lng }
    this.mapZoom.value = foundCity.zoom
  }

  /**
   * ЭКШЕН: Фокус на АЗС. Просто обновляет реактивные сигналы!
   * @param station - объект АЗС
   * @param keepCurrentZoom - если true, зум карты не изменится (для клика по маркеру)
   */
  // public focusOnStation = (station: Station, keepCurrentZoom = false) => {
  //   if (!this.map || !station.lat || !station.lng) return

  //   this.isProgrammatic.value = true
  //   this.mapCenter.value = { lat: station.lat, lng: station.lng }

  //   if (keepCurrentZoom) {
  //     // Если нужно сохранить зум, берем текущий зум карты и записываем его в сигнал,
  //     // чтобы сработал эффект cameraDisposer, но без изменения масштаба
  //     this.mapZoom.value = this.map.getZoom() || 11
  //   } else {
  //     // Для клика из внешнего списка React выставляем фиксированный детальный зум
  //     this.mapZoom.value = 16
  //   }
  // }
  /**
 * ЭКШЕН: Фокус на АЗС с автоматическим открытием балуна (InfoWindow)
 * @param station - объект АЗС
 * @param keepCurrentZoom - если true, зум карты не изменится (для клика по маркеру)
 */
  public focusOnStation = async (station: Station, keepCurrentZoom = false) => {
    if (!this.map || !station.lat || !station.lng) return

    // 1. Управляем камерой карты через реактивные сигналы
    this.isProgrammatic.value = true
    this.mapCenter.value = { lat: station.lat, lng: station.lng }

    if (keepCurrentZoom) {
      this.mapZoom.value = this.map.getZoom() || 11
    } else {
      this.mapZoom.value = 16
    }

    // 2. ПРОГРАММНОЕ ОТКРЫТИЕ БАЛУНА (ДЛЯ ВНЕШНЕГО КЛИКА ИЗ REACT)
    // Находим маркер целевой АЗС в нашем накопительном кэше
    const cachedMarkerData = this.markersMap.get(station.id)
    if (!cachedMarkerData) return // Если маркер ещё не успел отрендериться, выходим

    const { marker } = cachedMarkerData

    // Закрываем предыдущее окно, если оно было открыто
    if (this.activeInfoWindow) {
      this.activeInfoWindow.close()
    }

    // Загружаем библиотеку 'maps' для создания InfoWindow
    const mapsLib = await this.loader.importGoogleLibrary('maps')
    const { InfoWindow } = mapsLib

    // Создаем новое окно с контентом из UI-сервиса
    const infoWindow = new InfoWindow({
      headerContent: this.ui.createHeaderDiv(station), // station.title || station.name,
      content: this.ui.createHtmlContent(station),
    })

    // Вешаем слушатель очистки выбора при закрытии на крестик
    infoWindow.addListener('closeclick', () => {
      // this.selectedStation.value = null
    })

    // Открываем балун, привязав его к найденному маркеру
    infoWindow.open({
      anchor: marker,
      map: this.map
    })

    // Запоминаем инстанс окна в сервисе, чтобы иметь возможность закрыть его при следующем клике
    this.activeInfoWindow = infoWindow
  }

  /**
   * ИНФРАСТРУКТУРНЫЙ КОЛЛБЭК: Вызывается картой при остановке камеры
   */
  private handleMapIdle = () => {
    if (!this.map) return
    const bounds = this.map.getBounds()
    if (!bounds) return

    const southWest = bounds.getSouthWest()
    const northEast = bounds.getNorthEast()

    const newBboxString = [
      southWest.lat().toFixed(6),
      southWest.lng().toFixed(6),
      northEast.lat().toFixed(6),
      northEast.lng().toFixed(6)
    ].join(',')

    // Если карта сдвинулась (вручную мышкой или кодом), мы тихо обновляем bbox.
    // Так как у нас НЕТ эффекта, слушающего bbox и меняющего камеру,
    // это обновление БЕЗОПАСНО и никогда не зациклит карту!
    if (this.bbox.value !== newBboxString) {
      this.bbox.value = newBboxString
    }

    // Если движение было ручным (isProgrammatic === false),
    // синхронизируем реактивные сигналы центра и зума со слепком экрана карты
    if (!this.isProgrammatic.value) {
      const center = this.map.getCenter()
      this.mapCenter.value = { lat: center.lat(), lng: center.lng() }
      this.mapZoom.value = this.map.getZoom() || 11
    }
  }

  /**
 * НАКОПИТЕЛЬНЫЙ ДЕКЛАРАТИВНЫЙ РЕНДЕР (Без удаления и без морганий)
 */
  private async renderMarkers(stations: Station[] | null) {
    if (!this.markerClusterer || !this.map) return

    // Если данных нет, ничего не делаем (или очищаем при полной размонтировке)
    if (!stations || !Array.isArray(stations)) return

    // Подгружаем библиотеки Google Maps v3
    const [markerLib, mapsLib] = await Promise.all([
      this.loader.importGoogleLibrary('marker'),
      this.loader.importGoogleLibrary('maps')
    ])
    const { Marker } = markerLib
    const { InfoWindow } = mapsLib

    const newMarkersToCluster: any[] = []

    // Проходим по прилетевшим заправкам
    stations
      .filter(station => station.lat && station.lng)
      .forEach(station => {
        // ЗАЩИТА: Если эта заправка УЖЕ есть в нашем накопительном кэше —
        // мы её вообще не трогаем, не пересоздаем и не мигаем!
        if (this.markersMap.has(station.id)) {
          return
        }

        // Создаем маркер только для новой, ранее не скачанной заправки
        const marker = new Marker({
          position: { lat: station.lat, lng: station.lng }
          // По умолчанию маркеры сразу управляются кластеризатором, setMap(null)
        })

        // Навешиваем событие клика
        marker.addListener('click', () => {
          if (this.activeInfoWindow) this.activeInfoWindow.close()

          // Записываем выбранную станцию в сигнал движка
          // this.selectedStation.value = station

          // Создаем InfoWindow. Нативный auto-pan теперь можно вернуть,
          // так как накопительный кэш защищает маркеры от удаления при сдвигах!
          const infoWindow = new InfoWindow({
            headerContent: this.ui.createHeaderDiv(station), // station.title || station.name,
            content: this.ui.createHtmlContent(station),
          })

          infoWindow.addListener('closeclick', () => {
            // NOTE: Сброс "реактивного выбора"
            // this.selectedStation.value = null
          })

          infoWindow.open({ anchor: marker, map: this.map })
          this.activeInfoWindow = infoWindow

          // Плавно фокусируем камеру на маркер при клике
          this.focusOnStation(station, true)
        })

        // Сохраняем маркер в наш постоянный кэш
        this.markersMap.set(station.id, { marker, station })
        newMarkersToCluster.push(marker)
      })

    // Добавляем в кластеризатор ТОЛЬКО новые уникальные маркеры
    if (newMarkersToCluster.length > 0) {
      this.markerClusterer.addMarkers(newMarkersToCluster)
    }
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
}
