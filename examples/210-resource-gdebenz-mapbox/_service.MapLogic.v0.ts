import { BaseREService } from '../../src'
import { MapUiService } from './service.MapUiService'
import { MapboxLoaderService } from './service.MapboxLoaderService'
import mapboxgl from 'mapbox-gl'

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
  bbox: string
}

const AVAILABLE_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173, zoom: 10, bbox: '55.4898,37.3193,56.0095,37.9675' },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351, zoom: 10, bbox: '59.7444,29.9142,60.0906,30.6475' },
  { id: 'crimea', name: 'Крым (Симферополь)', lat: 44.9521, lng: 34.1024, zoom: 10, bbox: '44.8872,34.0201,45.0245,34.1979' },
  { id: 'krasnodar', name: 'Краснодар', lat: 45.0355, lng: 38.9747, zoom: 10, bbox: '44.9602,38.8785,45.1326,39.1235' }
]

export class MapLogic extends BaseREService {
  public cities: City[] = AVAILABLE_CITIES
  public currentCityId = this.createSignal<string>('moscow', 'map:signal:city-id')
  public selectedStation = this.createSignal<Station | null>(null, 'map:signal:selected-station')
  public mapCenter = this.createSignal<{ lat: number; lng: number }>({ lat: 55.7558, lng: 37.6173 }, 'map:signal:center')
  public mapZoom = this.createSignal<number>(10, 'map:signal:zoom')
  public isProgrammatic = this.createSignal<boolean>(false, 'map:signal:is-programmatic')
  public bbox = this.createSignal<string>(AVAILABLE_CITIES[0].bbox, 'map:signal:bbox')

  private ui = this.engine.inject(MapUiService)
  public loader = this.engine.inject(MapboxLoaderService)

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

  private map: mapboxgl.Map | null = null
  private activePopup: mapboxgl.Popup | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private markersCleanup: (() => void) | null = null
  private cameraDisposer: (() => void) | null = null
  private lastContainer: HTMLDivElement | null = null

  public initializeMap = async (container: HTMLDivElement) => {
    this.lastContainer = container
    this.loader.registerInitTrigger(() => {
      if (this.lastContainer) this.initializeMap(this.lastContainer)
    })

    if (this.map || this.loader.isKeyMissing.value) return

    try {
      mapboxgl.accessToken = this.loader.apiKey.value

      const [south, west, north, east] = this.bbox.value.split(',').map(Number)

      this.map = new mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [this.mapCenter.value.lng, this.mapCenter.value.lat],
        zoom: this.mapZoom.value,
        bounds: [west, south, east, north]
      })

      this.map.on('load', () => {
        if (!this.map) return

        this.map.addSource('stations', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        })

        this.map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'stations',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#2196f3',
            'circle-radius': ['step', ['get', 'point_count'], 15, 100, 20, 750, 25]
          }
        })

        this.map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'stations',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12
          },
          paint: {
            'text-color': '#ffffff'
          }
        })

        this.map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'stations',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#4caf50',
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        })

        this.map.on('click', 'clusters', (e: any) => {
          if (!this.map) return
          const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
          const clusterId = features[0].properties?.cluster_id
          const source = this.map.getSource('stations') as mapboxgl.GeoJSONSource

          source.getClusterExpansionZoom(clusterId, (err: any, zoom: any) => {
            if (err || !this.map || !e.lngLat || zoom === undefined) return
            this.map.easeTo({
              center: e.lngLat,
              zoom: zoom
            })
          })
        })

        this.map.on('click', 'unclustered-point', (e: any) => {
          if (!this.map || !e.features || !e.features[0]) return

          const coordinates = (e.features[0].geometry as any).coordinates.slice()
          const stationData = JSON.parse(e.features[0].properties?.station) as Station

          if (this.activePopup) this.activePopup.remove()

          this.selectedStation.value = stationData

          const popup = new mapboxgl.Popup({ closeOnClick: false })
            .setLngLat(coordinates)
            .setHTML(`
              <div class="mapbox-popup-header-title" style="font-family: sans-serif; font-size: 14px; font-weight: bold; color: #4caf50; padding-bottom: 4px; border-bottom: 1px solid #3a3a42; margin-bottom: 6px;">
                ${stationData.title || stationData.name}
              </div>
              ${this.ui.createHtmlContent(stationData)}
            `)
            .addTo(this.map)

          popup.on('close', () => {
            this.selectedStation.value = null
          })

          this.activePopup = popup
          this.focusOnStation(stationData, true)
        })

        this.map.on('mouseenter', 'clusters', () => { if (this.map) this.map.getCanvas().style.cursor = 'pointer' })
        this.map.on('mouseleave', 'clusters', () => { if (this.map) this.map.getCanvas().style.cursor = '' })
        this.map.on('mouseenter', 'unclustered-point', () => { if (this.map) this.map.getCanvas().style.cursor = 'pointer' })
        this.map.on('mouseleave', 'unclustered-point', () => { if (this.map) this.map.getCanvas().style.cursor = '' })

        this.initReactiveEffects()
      })

      this.map.on('idle', this.handleMapIdle)
      container.addEventListener('click', this.handlePopupLayerClick)

    } catch (e) {
      console.error('Ошибка инициализации Mapbox:', e)
    }
  }

  private initReactiveEffects() {
    this.cleanupEffects()

    this.markersCleanup = this.engine.effect(() => {
      this.renderMarkers(this.stationsResource.data)
    }, 'map:effect:sync-markers')

    this.cameraDisposer = this.engine.effect(() => {
      const center = this.mapCenter.value
      const zoom = this.mapZoom.value
      const programmatic = this.isProgrammatic.value

      if (!this.map) return

      if (programmatic) {
        this.map.flyTo({
          center: [center.lng, center.lat],
          zoom: zoom,
          essential: true,
          duration: 800
        })
        this.isProgrammatic.value = false
      }
    }, 'map:effect:sync-camera')
  }

  public destroyMap = () => {
    this.cleanupEffects()
    if (this.activePopup) this.activePopup.remove()
    if (this.map) this.map.remove()
    this.map = null
    this.activePopup = null
    this.lastContainer = null
  }

  private cleanupEffects() {
    if (this.markersCleanup) { this.markersCleanup(); this.markersCleanup = null; }
    if (this.cameraDisposer) { this.cameraDisposer(); this.cameraDisposer = null; }
  }

  public setCity = (cityId: string) => {
    const foundCity = this.cities.find(c => c.id === cityId)
    if (!foundCity) return

    this.currentCityId.value = cityId
    this.isProgrammatic.value = true
    this.mapCenter.value = { lat: foundCity.lat, lng: foundCity.lng }
    this.mapZoom.value = foundCity.zoom
  }

  public focusOnStation = (station: Station, keepCurrentZoom = false) => {
    if (!this.map || !station.lat || !station.lng) return

    this.isProgrammatic.value = true
    this.mapCenter.value = { lat: station.lat, lng: station.lng }

    if (keepCurrentZoom) {
      this.mapZoom.value = this.map.getZoom()
    } else {
      this.mapZoom.value = 15

      if (this.activePopup) this.activePopup.remove()

      const popup = new mapboxgl.Popup({ closeOnClick: false })
        .setLngLat([station.lng, station.lat])
        .setHTML(`
          <div class="mapbox-popup-header-title" style="font-family: sans-serif; font-size: 14px; font-weight: bold; color: #4caf50; padding-bottom: 4px; border-bottom: 1px solid #3a3a42; margin-bottom: 6px;">
            ${station.title || station.name}
          </div>
          ${this.ui.createHtmlContent(station)}
        `)
        .addTo(this.map)

      popup.on('close', () => {
        this.selectedStation.value = null
      })

      this.activePopup = popup
    }
  }

  private handleMapIdle = () => {
    if (!this.map) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    this.debounceTimer = setTimeout(() => {
      if (!this.map) return
      const bounds = this.map.getBounds()
      if (!bounds) return

      const southWest = bounds.getSouthWest()
      const northEast = bounds.getNorthEast()
      const newBboxString = [southWest.lat.toFixed(6), southWest.lng.toFixed(6), northEast.lat.toFixed(6), northEast.lng.toFixed(6)].join(',')
      if (this.bbox.value !== newBboxString) { this.bbox.value = newBboxString } if (!this.isProgrammatic.value) {
        const center = this.map.getCenter()
        this.mapCenter.value = { lat: center.lat, lng: center.lng }
        this.mapZoom.value = this.map.getZoom()
      }
    }, 300)
  }

  private renderMarkers(stations: Station[] | null) {
    if (!this.map) return
    const source = this.map.getSource('stations') as mapboxgl.GeoJSONSource
    if (!source) return
    if (!stations || !Array.isArray(stations)) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const features = stations.filter(station => station.lat && station.lng).map(station => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [station.lng, station.lat] }, properties: { id: station.id, station: JSON.stringify(station) } }))

    source.setData({ type: 'FeatureCollection', features: features })
  }

  private handlePopupLayerClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (this.ui.isSelectButton(target)) {
      const stationId = Number(target.getAttribute('data-station-id'))
      const foundStation = this.stationsResource.data?.find(s => s.id === stationId)
      if (foundStation) { this.selectedStation.value = foundStation }
    }
  }
}
