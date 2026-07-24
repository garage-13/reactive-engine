import { AbstractService } from '@pravosleva/reactive-engine'
// Импортируем чистые функции новой спецификации v2 вместо класса Loader
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

export class GoogleMapsLoaderService extends AbstractService {
  public apiKey = this.createSignal<string>(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', 'google:signal:api-key')
  public isKeyMissing = this.createComputed<boolean>(() => !this.apiKey.value)
  public loadError = this.createSignal<string | null>(null, 'google:signal:load-error')

  private onInitSuccessCallback: (() => void) | null = null
  private isConfigured = false

  public submitApiKey(key: string) {
    this.apiKey.value = key.trim()
    this.loadError.value = null
    this.isConfigured = false // Сбрасываем флаг конфигурации для нового ключа

    if (this.apiKey.value && this.onInitSuccessCallback) {
      this.onInitSuccessCallback()
    }
  }

  public registerInitTrigger(callback: () => void) {
    this.onInitSuccessCallback = callback
  }

  /**
   * Запрос библиотеки через глобальный современный метод importLibrary пакета v2
   */
  public async importGoogleLibrary(libraryName: 'maps' | 'marker' | 'core'): Promise<any> {
    if (this.isKeyMissing.value) {
      throw new Error('API-ключ Google Maps отсутствует.')
    }

    // Инициализируем глобальные настройки один раз перед импортом
    if (!this.isConfigured) {
      setOptions({
        // ИСПРАВЛЕНО: Заменили apiKey на key
        key: this.apiKey.value,
        // ИСПРАВЛЕНО: Заменили version на v в соответствии со спецификацией v2.x
        v: 'weekly'
      })
      this.isConfigured = true
    }

    try {
      return await importLibrary(libraryName)
    } catch (err) {
      this.loadError.value = 'Ошибка загрузки Google Maps. Проверьте валидность API-ключа.'
      throw err
    }
  }

  public reset() {
    this.apiKey.value = ''
    this.loadError.value = null
    this.isConfigured = false
    const oldScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (oldScript) oldScript.remove()
    if ((window as any).google) delete (window as any).google
  }
}
