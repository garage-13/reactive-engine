import { AbstractService } from '@pravosleva/reactive-engine'

export interface Track {
  id: string
  title: string
  url: string
}

const TRACK_LIST: Track[] = [
  {
    id: '1',
    title: 'Что Где когда - Пауза 1',
    url: 'https://pravosleva.pro/d/sounds-in-access-2025/static/projects/what-where-when/audio/pause1.mp3',
  },
  {
    id: '2',
    title: 'Что Где когда - Пауза  3',
    url: 'https://pravosleva.pro/d/sounds-in-access-2025/static/projects/what-where-when/audio/pause3.mp3',
  },
  {
    id: '3',
    title: 'Incorrect URL',
    url: 'https://gdebenzin.app',
  }
]

export class AudioPlayerLogic extends AbstractService {
  public tracks: Track[] = TRACK_LIST

  // Реактивные сигналы состояния для UI
  public currentTrackId = this.createSignal<string | null>(null, 'player:signal:track-id')
  public isPlaying = this.createSignal<boolean>(false, 'player:signal:is-playing')

  // Накопительный кэш аудио-буферов
  private audioCache = new Map<string, AudioBuffer>()

  // Инфраструктурные объекты Web Audio API
  private audioContext: AudioContext | null = null
  private audioSourceNode: AudioBufferSourceNode | null = null

  /**
   * Реактивный ресурс загрузки аудио.
   * Отвечает за реактивные статусы loading/error в UI при смене currentTrackId.
   */
  public audioResource = this.engine.resource(
    async (trackId, abortSignal) => {
      if (!trackId) return null

      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      // Если трек уже есть в кэше, возвращаем его мгновенно
      if (this.audioCache.has(trackId)) {
        return this.audioCache.get(trackId)!
      }

      const track = this.tracks.find(t => t.id === trackId)
      if (!track) throw new Error('Трек не найден')

      const response = await fetch(track.url, { signal: abortSignal })
      if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`)

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

      // Сохраняем в накопительный кэш
      this.audioCache.set(trackId, audioBuffer)
      return audioBuffer
    },
    this.currentTrackId,
    {
      name: 'player:resource:load-audio',
      validateBeforeFetch: (trackId) => !!trackId
    }
  )

  /**
   * Экшен простого выбора трека из списка (БЕЗ автоплея)
   */
  public selectTrack(trackId: string) {
    this.stop()
    this.currentTrackId.value = trackId
  }

  /**
   * Экшен запуска воспроизведения
   */
  public play() {
    const buffer = this.audioResource.data

    // Если файл еще грузится, произошла ошибка или музыка уже играет — выходим
    if (!buffer || !this.audioContext || this.isPlaying.value) return

    // Пробуждаем контекст (нужно, если браузер заблокировал его до первого клика)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    // Создаем чистую одноразовую ноду источника звука
    this.audioSourceNode = this.audioContext.createBufferSource()
    this.audioSourceNode.buffer = buffer
    this.audioSourceNode.connect(this.audioContext.destination)

    // Коллбэк естественного окончания трека
    this.audioSourceNode.onended = () => {
      if (this.isPlaying.value) {
        this.isPlaying.value = false
      }
    }

    this.audioSourceNode.start(0)
    this.isPlaying.value = true
  }

  /**
   * Экшен полной остановки воспроизведения
   */
  public stop() {
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.stop()
      } catch (e) {
        // Игнорируем ошибки, если нода уже завершила работу
      }
      this.audioSourceNode.disconnect()
      this.audioSourceNode = null
    }

    this.isPlaying.value = false
  }

  /**
   * Деструктор сервиса для очистки при размонтировании
   */
  public destroy() {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.currentTrackId.value = null
    this.audioCache.clear()
  }
}
