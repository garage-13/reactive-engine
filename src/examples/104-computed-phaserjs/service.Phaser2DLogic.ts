import Phaser from 'phaser'
import { BaseREService } from '../../BaseREService'

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

export class Phaser2DLogic extends BaseREService {
  public cities: City[] = AVAILABLE_CITIES
  public currentCityId = this.createSignal<string>('moscow', 'phaser:signal:city-id')
  public speed = this.createSignal<number>(1, 'phaser:signal:speed')
  public spriteScale = this.createSignal<number>(1, 'phaser:signal:scale')

  // ИСПРАВЛЕНО: Перенесли объявление сигнала spriteCount выше computed-свойства!
  // Возвращаем сигнал количества спрайтов, который был упущен в объявлении свойств
  public spriteCount = this.createSignal<number>(30, 'phaser:signal:count')

  public statusInfo = this.createComputed<string>(() => {
    const count = this.spriteCount.value
    const curSpeed = this.speed.value
    const scale = this.spriteScale.value
    return curSpeed === 0
      ? `Phaser Scene: ${count} объектов | Движение приостановлено`
      : `Phaser Scene: ${count} объектов | Скорость: ${curSpeed}x | Масштаб: ${scale.toFixed(1)}x`
  })

  private game: Phaser.Game | null = null
  private activeScene: Phaser.Scene | null = null
  private spritesGroup: Phaser.GameObjects.Group | null = null
  private effectDisposers: (() => void)[] = []

  private resizeObserver: ResizeObserver | null = null
  private lastResizeTime = 0
  private resizeThrottleTimeout: ReturnType<typeof setTimeout> | null = null
  private memorySpeed = 1

  // ИСПРАВЛЕНИЕ: Добавили объявление упущенного свойства lastContainer
  private lastContainer: HTMLDivElement | null = null

  public initializePhaser = (canvasContainer: HTMLDivElement) => {
    this.lastContainer = canvasContainer
    if (this.game) return

    const width = canvasContainer.clientWidth
    const height = canvasContainer.clientHeight

    // ИСПРАВЛЕНИЕ: Переписали коллбэки создания и обновления через self-ссылку
    // для полного соответствия встроенным типам SceneCreateCallback в GameConfig
    const self = this

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: width,
      height: height,
      parent: canvasContainer,
      transparent: true,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false
        }
      },
      scene: {
        create: function (this: Phaser.Scene) {
          self.phaserCreate(this)
        },
        update: function (this: Phaser.Scene) {
          self.phaserUpdate()
        }
      }
    }

    this.game = new Phaser.Game(config)
    this.startResizeTracking(canvasContainer)
  }

  private phaserCreate = (scene: Phaser.Scene) => {
    this.activeScene = scene
    this.spritesGroup = scene.add.group()

    // ИСПРАВЛЕНИЕ: Создаем графику через scene.add и убираем невалидное свойство 'add'
    const graphics = scene.add.graphics()

    graphics.fillStyle(0x00b4d8, 0.8)
    graphics.fillRect(0, 0, 30, 30)
    graphics.lineStyle(2, 0xffffff, 1)
    graphics.strokeRect(0, 0, 30, 30)

    // Генерируем текстуру в кэш Phaser под уникальным ключом
    graphics.generateTexture('neonSquare', 30, 30)

    // Сразу уничтожаем системный объект графики — текстура при этом останется в памяти!
    graphics.destroy()

    this.generateSprites()
    this.initReactiveEffects()
  }


  private initReactiveEffects() {
    this.cleanupEffects()

    // Эффект 1: Изменение количества элементов
    const countDisposer = this.engine.effect(() => {
      this.spriteCount.value
      this.generateSprites()
    }, 'phaser:effect:sync-count')
    this.effectDisposers.push(countDisposer)

    // Эффект 2: Масштаб спрайтов
    const scaleDisposer = this.engine.effect(() => {
      const currentScale = this.spriteScale.value
      if (!this.spritesGroup) return

      this.spritesGroup.getChildren().forEach((child: any) => {
        child.setScale(currentScale)
        if (child.body) {
          child.body.setSize(child.width, child.height)
        }
      })
    }, 'phaser:effect:sync-scale')
    this.effectDisposers.push(scaleDisposer)

    // ИСПРАВЛЕНИЕ БАГА: Эффект 3: Реактивное управление глобальным временем физического мира Phaser
    const speedDisposer = this.engine.effect(() => {
      const targetSpeed = this.speed.value
      if (!this.activeScene || !this.activeScene.physics.world) return

      if (targetSpeed === 0) {
        // Если скорость 0 — ставим физический мир на паузу встроенным флагом
        this.activeScene.physics.world.isPaused = true
      } else {
        this.activeScene.physics.world.isPaused = false
        // В Phaser свойство timeScale работает инверсивно:
        // чтобы ускорить мир в 4 раза, timeScale должен быть равен 1 / 4 (0.25)
        this.activeScene.physics.world.timeScale = 1 / targetSpeed
      }
    }, 'phaser:effect:sync-speed')
    this.effectDisposers.push(speedDisposer)
  }

  private generateSprites() {
    if (!this.activeScene || !this.spritesGroup || !this.game) return

    const targetCount = this.spriteCount.value
    const currentCount = this.spritesGroup.getLength()

    if (currentCount < targetCount) {
      const width = this.game.scale.width
      const height = this.game.scale.height

      for (let i = currentCount; i < targetCount; i++) {
        const x = Phaser.Math.Between(50, width - 50)
        const y = Phaser.Math.Between(50, height - 50)

        const sprite = this.activeScene.physics.add.image(x, y, 'neonSquare')

        sprite.setCollideWorldBounds(true)
        sprite.setBounce(1, 1)
        sprite.setScale(this.spriteScale.value)

        const vx = Phaser.Math.Between(-150, 150)
        const vy = Phaser.Math.Between(-150, 150)

        // ВАЖНО: Устанавливаем физическую скорость ОДИН РАЗ при рождении объекта.
        // Phaser сам будет её интерполировать. Больше мы её не перезаписываем.
        sprite.body.setVelocity(
          vx === 0 ? 100 : vx,
          vy === 0 ? 100 : vy
        )

        this.spritesGroup.add(sprite)
      }
    } else if (currentCount > targetCount) {
      const children = this.spritesGroup.getChildren()
      const toRemove = children.slice(targetCount)

      toRemove.forEach(child => {
        this.spritesGroup?.remove(child)
        child.destroy()
      })
    }
  }

  /**
   * ИСПРАВЛЕНИЕ БАГА: Метод обновления кадра теперь абсолютно пустой.
   * Нам больше не нужно спамить setVelocity на каждом кадре и ломать интерполяцию кадров фреймворка.
   */
  private phaserUpdate = () => {
    // Чисто
  }

  private startResizeTracking(container: HTMLDivElement) {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (!entry.contentBoxSize || entry.contentBoxSize.length === 0) continue

        const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0]
        const now = Date.now()
        const throttleLimit = 50

        if (this.resizeThrottleTimeout) clearTimeout(this.resizeThrottleTimeout)

        if (now - this.lastResizeTime >= throttleLimit) {
          this.handleResize(width, height)
          this.lastResizeTime = now
        } else {
          this.resizeThrottleTimeout = setTimeout(() => {
            this.handleResize(width, height)
            this.lastResizeTime = Date.now()
          }, throttleLimit - (now - this.lastResizeTime))
        }
      }
    })
    this.resizeObserver.observe(container)
  }

  private handleResize(width: number, height: number) {
    if (!this.game) return
    this.game.scale.resize(width, height)
  }

  public setSpeed(value: number) {
    if (value !== 0) this.memorySpeed = value
    this.speed.value = value
  }

  public resumeSpeed() {
    this.speed.value = this.memorySpeed
  }

  public setScale(value: number) { this.spriteScale.value = value }
  public setCount(value: number) { this.spriteCount.value = value }

  public destroyPhaser = () => {
    this.cleanupEffects()

    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.resizeThrottleTimeout) { clearTimeout(this.resizeThrottleTimeout); this.resizeThrottleTimeout = null; }

    if (this.game) {
      this.game.destroy(true)
    }

    this.game = null
    this.activeScene = null
    this.spritesGroup = null
    this.lastContainer = null
    this.lastResizeTime = 0
  }

  private cleanupEffects() {
    this.effectDisposers.forEach(dispose => dispose())
    this.effectDisposers = []
  }
}
