import { BaseREService } from '../../src'

export class GoogleMapsLoaderService extends BaseREService {
  // Инициализируем ключ из env-переменной Vite
  public apiKey = this.createSignal<string>(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', 'google:signal:api-key')
  public isKeyMissing = this.createComputed<boolean>(() => !this.apiKey.value)
  public loadError = this.createSignal<string | null>(null, 'google:signal:load-error')

  private onInitSuccessCallback: (() => void) | null = null
  private isLoaded = false

  public submitApiKey(key: string) {
    this.apiKey.value = key.trim()
    this.loadError.value = null

    if (this.apiKey.value && this.onInitSuccessCallback) {
      this.onInitSuccessCallback()
    }
  }

  public registerInitTrigger(callback: () => void) {
    this.onInitSuccessCallback = callback
  }

  /**
   * Ленивая загрузка скрипта Google Maps JavaScript API
   */
  public loadScript(): Promise<void> {
    if (this.isLoaded) return Promise.resolve()
    if (this.isKeyMissing.value) {
      throw new Error('API-ключ Google Maps отсутствует.')
    }

    // Удаляем старый скрипт, если была ошибка
    const oldScript = document.querySelector('script[src*="://googleapis.com"]')
    if (oldScript) oldScript.remove()

    return new Promise((resolve, reject) => {
      // Создаем глобальный коллбэк, который вызовет Google Maps после загрузки
      const callbackName = '__googleMapsInitCallback'
        ; (window as any)[callbackName] = () => {
          this.isLoaded = true
          this.loadError.value = null
          resolve()
          delete (window as any)[callbackName]
        }

      const script = document.createElement('script')
      // Используем современный URL загрузки с указанием коллбэка
      script.src = `https://://googleapis.com/maps/api/js?key=${this.apiKey.value}&callback=${callbackName}&v=weekly`
      script.async = true
      script.defer = true

      script.onerror = (err) => {
        this.loadError.value = 'Сетевая ошибка загрузки Google Maps. Проверьте валидность API-ключа.'
        reject(err)
      }

      document.head.appendChild(script)
    })
  }

  public reset() {
    this.apiKey.value = ''
    this.loadError.value = null
    this.isLoaded = false
    const oldScript = document.querySelector('script[src*="://googleapis.com"]')
    if (oldScript) oldScript.remove()
    if ((window as any).google) delete (window as any).google
  }
}
