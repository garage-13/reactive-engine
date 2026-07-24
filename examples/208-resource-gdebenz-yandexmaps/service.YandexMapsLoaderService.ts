import { AbstractService } from '@pravosleva/reactive-engine'

export class YandexMapsLoaderService extends AbstractService {
  // Текущий токен (пытаемся прочесть из env)
  public apiKey = this.createSignal<string>(import.meta.env.VITE_YANDEX_MAPS_API_KEY || '', 'ymaps:signal:api-key')

  // Вычисляемый статус отсутствия ключа
  public isKeyMissing = this.createComputed<boolean>(() => !this.apiKey.value)

  // Сигнал ошибки загрузки (невалидный ключ, блокировка сети и т.д.)
  public loadError = this.createSignal<string | null>(null, 'ymaps:signal:load-error')

  // Храним успешный инстанс ymaps3, чтобы не загружать скрипт повторно
  private ymapsInstance: any = null
  // Коллбэк для принудительного ререндера карты при успешном вводе ключа
  private onInitSuccessCallback: (() => void) | null = null

  /**
   * Метод ручной установки ключа из UI формы
   */
  public submitApiKey(key: string) {
    this.apiKey.value = key.trim()
    this.loadError.value = null

    // Если ключ ввели и у нас зарегистрирован коллбэк карты — пробуем инициализировать её
    if (this.apiKey.value && this.onInitSuccessCallback) {
      this.onInitSuccessCallback()
    }
  }

  /**
   * Регистрирует триггер на успешную активацию ключа
   */
  public registerInitTrigger(callback: () => void) {
    this.onInitSuccessCallback = callback
  }

  /**
   * Асинхронная ленивая загрузка скрипта API v3
   */
  public async loadScript(): Promise<any> {
    if (this.ymapsInstance) return this.ymapsInstance
    if (this.isKeyMissing.value) {
      throw new Error('API-ключ отсутствует. Загрузка скрипта невозможна.')
    }

    // Очищаем старый упавший скрипт, если пользователь вводит ключ повторно после ошибки
    const oldScript = document.querySelector('script[src*="api-maps.yandex.ru"]')
    if (oldScript) oldScript.remove()

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      // script.src = `https://yandex.ru{this.apiKey.value}&lang=ru_RU`

      // ВАЖНО: Для v3 URL должен содержать параметр apikey
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${this.apiKey.value}`

      script.async = true

      script.onload = async () => {
        try {
          const ymaps3 = (window as any).ymaps3
          await ymaps3.ready
          // Загружаем обязательный модуль кластеризации
          await ymaps3.import('@yandex/ymaps3-clusterer@latest')

          this.ymapsInstance = ymaps3
          this.loadError.value = null
          resolve(ymaps3)
        } catch (e) {
          this.loadError.value = 'Ошибка инициализации модулей Яндекса внутри скрипта.'
          reject(e)
        }
      }

      script.onerror = (err) => {
        this.loadError.value = 'Сетевая ошибка загрузки скрипта. Проверьте валидность API-ключа.'
        reject(err)
      }

      document.head.appendChild(script)
    })
  }

  /**
   * Сброс состояния для ввода другого ключа при ошибке
   */
  public reset() {
    this.apiKey.value = ''
    this.loadError.value = null
    this.ymapsInstance = null
    const oldScript = document.querySelector('script[src*="api-maps.yandex.ru"]')
    if (oldScript) oldScript.remove()
    if ((window as any).ymaps3) delete (window as any).ymaps3
  }
}
