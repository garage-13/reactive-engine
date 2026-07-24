import { AbstractService } from '@pravosleva/reactive-engine'
import { MapUiService } from './service.MapUiService'
import { GoogleMapsLoaderService } from './service.GoogleMapsLoaderService'
import { MarkerClusterer } from '@googlemaps/markerclusterer'

/**
 * Описание структуры данных автозаправочной станции (АЗС).
 */
export interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

/**
 * Описание структуры географических данных города.
 */
export interface City {
  id: string
  name: string
  lat: number
  lng: number
  zoom: number
  bbox: string // Стартовый bbox для инициализации ресурса
}

/**
 * Фиксированный список городов, доступных пользователю для переключения в интерфейсе.
 */
const AVAILABLE_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173, zoom: 11, bbox: '55.4898,37.3193,56.0095,37.9675' },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351, zoom: 11, bbox: '59.7444,29.9142,60.0906,30.6475' },
  { id: 'crimea', name: 'Крым (Симферополь)', lat: 44.9521, lng: 34.1024, zoom: 11, bbox: '44.8872,34.0201,45.0245,34.1979' },
  { id: 'krasnodar', name: 'Краснодар', lat: 45.0355, lng: 38.9747, zoom: 11, bbox: '44.9602,38.8785,45.1326,39.1235' }
]

/**
 * Бизнес-сервис управления картой Google Maps и синхронизации с реактивным движком.
 *
 * Класс изолирует всю императивную работу с картографией (инициализация, маркеры, события),
 * предоставляя React-компоненту исключительно декларативный интерфейс через сигналы.
 *
 * Реализует паттерн "Единственный источник правды" (Single Source of Truth), где состояние
 * экрана карты диктует значения выходных координат для API-ресурса.
 *
 * @extends BaseREService
 */
export class MapLogic extends AbstractService {
  /** Список доступных городов для построения элементов управления в UI. */
  public cities: City[] = AVAILABLE_CITIES

  /** Реактивный сигнал идентификатора текущего выбранного города. По умолчанию 'moscow'. */
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')

  /** Реактивный сигнал текущей выбранной заправки (активный элемент в приложении). */
  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')

  /** Реактивный сигнал текущих географических координат центра карты. */
  public mapCenter = this.createSignal<{ lat: number; lng: number }>({ lat: 55.7558, lng: 37.6173 }, 'map:signal:center')

  /** Реактивный сигнал текущего масштаба (зума) карты. */
  public mapZoom = this.createSignal<number>(11, 'map:signal:zoom')

  /** Реактивный сигнал-блокировщик. Взводится в true, если движение карты вызвано программным экшеном. */
  public isProgrammatic = this.createSignal<boolean>(false, 'map:signal:is-programmatic')

  /** Выходной реактивный сигнал географических границ экрана в формате "south,west,north,east" для API-запросов. */
  public bbox = this.createSignal<string>(AVAILABLE_CITIES[0].bbox, 'map:signal:bbox')

  /** UI-сервис генерации HTML-контента балунов (внедряется через DI). */
  private ui = this.engine.inject(MapUiService)

  /** Инфраструктурный сервис ленивой загрузки Google Maps API v3 (внедряется через DI). */
  public loader = this.engine.inject(GoogleMapsLoaderService)

  /**
   * Реактивный ресурс получения списка АЗС.
   * Автоматически перезапускается при изменении сигнала `this.bbox`.
   * Поддерживает отмену предыдущих незавершенных сетевых запросов через `abortSignal`.
   */
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
  /** Инстанс карты Google Maps. */
  private map: any = null
  /** Инстанс библиотеки кластеризации маркеров. */
  private markerClusterer: MarkerClusterer | null = null
  /** Инстанс текущего открытого всплывающего окна (балуна) на карте. */
  private activeInfoWindow: any = null
  /** Накопительный кэш отрисованных маркеров: [stationId] -> { инстанс_маркера, данные_станции } (для хранения ВСЕХ скачанных АЗС за сессию). */
  private markersMap = new Map<number, { marker: any; station: Station }>()

  /** Массив функций очистки (disposers) для реактивных эффектов движка. */
  private disposers: (() => void)[] = []
  /** Массив зарегистрированных слушателей событий карты Google Maps. */
  private mapListeners: any[] = []
  /** Ссылка на DOM-контейнер, в котором смонтирована карта. */
  private lastContainer: HTMLDivElement | null = null

  /**
   * Инициализация инстанса карты Google Maps в переданном DOM-контейнере.
   * Вызывается автоматически из React-компонента при его монтировании.
   *
   * @public
   * @async
   * @param {HTMLDivElement} container - DOM-элемент для монтирования холста карты.
   * @returns {Promise<void>}
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
   * Инициализация реактивных эффектов движка для синхронизации стейта с картой.
   * @private
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
   * Полное уничтожение карты, очистка слушателей и освобождение памяти.
   * Вызывается автоматически из React-компонента при его размонтировании.
   *
   * @public
   */
  public destroyMap = () => {
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

  /**
   * Очистка зарегистрированных реактивных эффектов.
   * @private
   */
  private cleanupEffects() {
    this.disposers.forEach(dispose => dispose())
    this.disposers = []
  }

  /**
   * Экшен переключения текущего города из UI селекта.
   * Императивно обновляет реактивные сигналы позиции для триггера эффекта камеры.
   *
   * @public
   * @param {string} cityId - Идентификатор выбранного города.
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
   * Публичный экшен для фокусировки камеры карты на конкретной АЗС и программного открытия балуна.
   *
   * Метод используется для управления картой из внешних UI-компонентов React (например, при клике
   * на карточку заправки в списке или блок «Реактивный выбор»). Перелёт и позиционирование
   * выполняются через обновление базовых сигналов `mapCenter` и `mapZoom`, что атомарно
   * обрабатывается реактивным эффектом синхронизации камеры.
   *
   * Логика работы:
   * 1. Взводит сигнал-блокировщик `isProgrammatic.value = true`, изолируя это движение от ручного скролла.
   * 2. Обновляет географические сигналы центра и зума. В зависимости от параметра `keepCurrentZoom`
   *    карта либо плавно центрируется на текущем масштабе (сценарий клика по маркеру), либо выставляет
   *    детальный масштаб `16` (сценарий внешнего клика по списку).
   * 3. Обращается к накопительному кэшу `this.markersMap` для извлечения долгоживущего инстанса маркера.
   * 4. Асинхронно импортирует библиотеку окон Google Maps, инициализирует новое окно `InfoWindow`
   *    с версткой из UI-сервиса и программно открывает его над найденным маркером-якорем.
   *
   * @public
   * @async
   * @param {Station} station - Объект АЗС, на которую необходимо сфокусировать карту.
   * @param {boolean} [keepCurrentZoom=false] - Флаг сохранения текущего масштаба. Если `true`, масштаб
   * карты не изменится. Используется для предотвращения неожиданного сброса зума при кликах по маркерам.
   * @returns {Promise<void>} Промис, разрешающийся после асинхронного импорта библиотек Google Maps и открытия окна.
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
   * Инфраструктурный коллбэк, срабатывающий при полной остановке камеры карты (событие 'idle').
   *
   * Метод является ключевым звеном в реализации паттерна "Единственный источник правды"
   * (Single Source of Truth), где текущее географическое состояние экрана карты управляет
   * реактивным стейтом приложения, а не наоборот.
   *
   * Логика работы метода:
   * 1. Метод извлекает точные географические границы видимой области экрана (`LatLngBounds`).
   * 2. С помощью дебаунса в 300 мс (для предотвращения спама запросами во время микро-корректировок)
   *    формируется строка формата `south,west,north,east`, которая записывается в сигнал `this.bbox`.
   * 3. Изменение `this.bbox` автоматически перезапускает реактивный ресурс `stationsResource`
   *    для подгрузки АЗС под новую область видимости.
   * 4. Если движение карты было ручным (пользователь скроллил мышью или зумил), метод синхронизирует
   *    сигналы `this.mapCenter` и `this.mapZoom` со слепком экрана карты, чтобы другие компоненты
   *    приложения знали актуальную позицию камеры.
   *
   * Благодаря событийно-командной схеме и отсутствию реактивных эффектов, которые слушали бы `bbox`
   * и двигали карту в ответ, данный метод полностью застрахован от бесконечных циклов и зацикливания камеры.
   *
   * @private
   * @returns {void}
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
   * Декларативный накопительный рендеринг маркеров АЗС на карте.
   *
   * Метод реализует паттерн накопительного кэширования (Accumulative Cache) для предотвращения
   * моргания интерфейса и самопроизвольного закрытия всплывающих окон при обновлении области `bbox`.
   * Вместо полного удаления маркеров при каждом прилёте данных от API, метод сравнивает новые
   * поступления с уже отрисованными объектами:
   *
   * 1. Ранее не встречавшиеся АЗС инициализируются как новые инстансы `Marker`, сохраняются
   *    в постоянный кэш `this.markersMap` и массово добавляются в кластеризатор.
   * 2. Уже существующие заправки полностью игнорируются при перерисовке, что сохраняет их
   *    DOM-структуру в памяти Google Maps, гарантируя стабильность открытых окон `InfoWindow`.
   *
   * При клике на маркер метод закрывает предыдущие окна, переводит сигнал `selectedStation`
   * в активное состояние, привязывает `InfoWindow` к маркеру-якорю и инициирует плавный
   * перелёт камеры к выбранной точке.
   *
   * @private
   * @async
   * @param {Station[] | null} stations - Массив объектов АЗС, полученный из реактивного ресурса `stationsResource`.
   * @returns {Promise<void>} Промис, разрешающийся после успешной ленивой загрузки библиотек Google Maps и рендеринга маркеров.
   */
  private async renderMarkers(stations: Station[] | null): Promise<void> {
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

          // NOTE: Записываем выбранную станцию в сигнал движка (если нужно)
          // this.selectedStation.value = station

          // Создаем InfoWindow. Нативный auto-pan теперь можно вернуть,
          // так как накопительный кэш защищает маркеры от удаления при сдвигах!
          const infoWindow = new InfoWindow({
            headerContent: this.ui.createHeaderDiv(station), // station.title || station.name,
            content: this.ui.createHtmlContent(station),
          })

          infoWindow.addListener('closeclick', () => {
            // NOTE: Сброс "реактивного выбора" (если нужно)
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

  /**
   * Обработчик глобального делегирования событий клика для контента балунов.
   *
   * Поскольку Google Maps рендерит всплывающие окна (InfoWindow) в собственном
   * изолированном DOM-дереве, стандартные обработчики кликов React (onClick)
   * на элементах внутри `createHtmlContent` не работают.
   *
   * Метод слушает все клики по контейнеру карты, перехватывает нажатия на кастомную
   * кнопку «Выбрать АЗС» по её CSS-классу, извлекает идентификатор заправки из
   * атрибута `data-station-id` и реактивно сохраняет выбранную станцию в сигнал.
   *
   * @private
   * @param {MouseEvent} e - Нативное браузерное событие клика мыши.
   * @returns {void}
   */
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
