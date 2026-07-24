import { AbstractService } from '@pravosleva/reactive-engine'

export class MapboxLoaderService extends AbstractService {
  public apiKey = this.createSignal<string>(import.meta.env.VITE_MAPBOX_API_KEY || '', 'mapbox:signal:api-key')
  public isKeyMissing = this.createComputed<boolean>(() => !this.apiKey.value)
  public loadError = this.createSignal<string | null>(null, 'mapbox:signal:load-error')

  private onInitSuccessCallback: (() => void) | null = null

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

  public reset() {
    this.apiKey.value = ''
    this.loadError.value = null
  }
}
