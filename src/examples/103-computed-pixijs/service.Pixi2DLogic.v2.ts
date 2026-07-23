import * as PIXI from 'pixi.js'
import { BaseREService } from '../../BaseREService'

export class Pixi2DLogic extends BaseREService {
  public spriteCount = this.createSignal<number>(30, 'pixi:signal:count')
  public speed = this.createSignal<number>(1, 'pixi:signal:speed')
  public spriteScale = this.createSignal<number>(1, 'pixi:signal:scale')

  public statusInfo = this.createComputed<string>(() => {
    const count = this.spriteCount.value
    const curSpeed = this.speed.value
    const scale = this.spriteScale.value
    return curSpeed === 0
      ? `PixiJS Scene: ${count} объектов | Движение приостановлено`
      : `PixiJS Scene: ${count} объектов | Скорость: ${curSpeed}x | Масштаб: ${scale.toFixed(1)}x`
  })

  private app: PIXI.Application | null = null
  private container: PIXI.Container | null = null
  private effectDisposers: (() => void)[] = []
  private resizeObserver: ResizeObserver | null = null
  private lastResizeTime = 0
  private resizeThrottleTimeout: ReturnType<typeof setTimeout> | null = null

  // Свойство для сохранения скорости, которая была до нажатия паузы (по умолчанию 1)
  private memorySpeed = 1

  public initializePixi = async (canvasContainer: HTMLDivElement) => {
    if (this.app) return

    const width = canvasContainer.clientWidth
    const height = canvasContainer.clientHeight

    this.app = new PIXI.Application()

    await this.app.init({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      resizeTo: undefined
    })

    canvasContainer.appendChild(this.app.canvas)

    this.container = new PIXI.Container()
    this.app.stage.addChild(this.container)

    this.generateSprites()
    this.app.ticker.add(this.animate)

    this.initReactiveEffects()
    this.startResizeTracking(canvasContainer)
  }

  private initReactiveEffects() {
    this.cleanupEffects()

    const countDisposer = this.engine.effect(() => {
      this.spriteCount.value
      this.generateSprites()
    }, 'pixi:effect:sync-count')
    this.effectDisposers.push(countDisposer)

    const scaleDisposer = this.engine.effect(() => {
      const currentScale = this.spriteScale.value
      if (!this.container) return

      this.container.children.forEach((child) => {
        child.scale.set(currentScale)
      })
    }, 'pixi:effect:sync-scale')
    this.effectDisposers.push(scaleDisposer)
  }

  private generateSprites() {
    if (!this.app || !this.container) return

    const targetCount = this.spriteCount.value
    const currentCount = this.container.children.length

    if (currentCount < targetCount) {
      const graphics = new PIXI.Graphics()
        .rect(-15, -12, 30, 30)
        .fill({ color: 0x00b4d8, alpha: 0.8 })
        .stroke({ width: 2, color: 0xffffff })

      const texture = this.app.renderer.generateTexture(graphics)

      for (let i = currentCount; i < targetCount; i++) {
        const sprite = new PIXI.Sprite(texture)

        sprite.x = Math.random() * this.app.screen.width
        sprite.y = Math.random() * this.app.screen.height
        sprite.anchor.set(0.5)

          ; (sprite as any).rotationSpeed = (Math.random() - 0.5) * 0.02
          ; (sprite as any).directionX = (Math.random() - 0.5) * 2
          ; (sprite as any).directionY = (Math.random() - 0.5) * 2

        sprite.scale.set(this.spriteScale.value)

        this.container.addChild(sprite)
      }
      graphics.destroy()
    } else if (currentCount > targetCount) {
      const removed = this.container.removeChildren(targetCount)
      removed.forEach(child => child.destroy())
    }
  }

  private animate = (ticker: PIXI.Ticker) => {
    if (!this.container || !this.app) return

    const speedMultiplier = this.speed.value

    this.container.children.forEach((child: any) => {
      child.rotation += child.rotationSpeed * speedMultiplier * ticker.deltaTime
      child.x += child.directionX * speedMultiplier * ticker.deltaTime
      child.y += child.directionY * speedMultiplier * ticker.deltaTime

      if (child.x < 0 || child.x > this.app!.screen.width) child.directionX *= -1
      if (child.y < 0 || child.y > this.app!.screen.height) child.directionY *= -1
    })
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
    if (!this.app) return
    this.app.renderer.resize(width, height)
  }

  public setSpeed(value: number) {
    // Если выставляем рабочую скорость (не 0) — запоминаем её для продолжения
    if (value !== 0) {
      this.memorySpeed = value
    }
    this.speed.value = value
  }

  /**
   * Возобновить движение со скоростью, которая была зафиксирована до паузы
   */
  public resumeSpeed() {
    this.speed.value = this.memorySpeed
  }

  public setScale(value: number) { this.spriteScale.value = value }
  public setCount(value: number) { this.spriteCount.value = value }

  public destroyPixi = () => {
    this.cleanupEffects()

    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.resizeThrottleTimeout) { clearTimeout(this.resizeThrottleTimeout); this.resizeThrottleTimeout = null; }

    if (this.app) {
      try {
        this.app.ticker?.remove(this.animate)
        this.app.destroy({ removeView: true })
      } catch (error) {
        console.warn('Мягкий перехват незавершенной инициализации PixiJS при размонтировании:', error)
      }
    }

    this.app = null
    this.container = null
    this.lastResizeTime = 0
  }

  private cleanupEffects() {
    this.effectDisposers.forEach(dispose => dispose())
    this.effectDisposers = []
  }
}
