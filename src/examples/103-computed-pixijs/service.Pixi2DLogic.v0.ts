import * as PIXI from 'pixi.js'
import { BaseREService } from '../../BaseREService'

export class Pixi2DLogic extends BaseREService {
  // Базовые реактивные сигналы
  public spriteCount = this.createSignal<number>(30, 'pixi:signal:count')
  public speed = this.createSignal<number>(1, 'pixi:signal:speed')
  public spriteScale = this.createSignal<number>(1, 'pixi:signal:scale')

  // Реактивное вычисляемое свойство (computed)
  public statusInfo = this.createComputed<string>(() => {
    const count = this.spriteCount.value
    const curSpeed = this.speed.value
    const scale = this.spriteScale.value
    return `PixiJS Scene: ${count} объектов | Скорость: ${curSpeed}x | Масштаб: ${scale.toFixed(1)}x`
  })

  // Внутренние инфраструктурные объекты PixiJS
  private app: PIXI.Application | null = null
  private container: PIXI.Container | null = null
  private effectDisposers: (() => void)[] = []
  private resizeObserver: ResizeObserver | null = null
  private lastResizeTime = 0
  private resizeThrottleTimeout: ReturnType<typeof setTimeout> | null = null

  /**
   * Инициализация PixiJS приложения
   */
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
      // ВАЖНО: Убеждаемся, что нативный авто-ресайз отключен,
      // чтобы PixiJS не пытался регистрировать внутренний _cancelResize
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


  /**
   * Реактивная синхронизация сигналов движка с PixiJS
   */
  private initReactiveEffects() {
    this.cleanupEffects()

    // Эффект динамической перегенерации количества элементов
    const countDisposer = this.engine.effect(() => {
      this.spriteCount.value // Подписка
      this.generateSprites()
    }, 'pixi:effect:sync-count')
    this.effectDisposers.push(countDisposer)

    // Эффект точечного изменения масштаба всех объектов на GPU
    const scaleDisposer = this.engine.effect(() => {
      const currentScale = this.spriteScale.value
      if (!this.container) return

      this.container.children.forEach((child) => {
        child.scale.set(currentScale)
      })
    }, 'pixi:effect:sync-scale')
    this.effectDisposers.push(scaleDisposer)
  }

  /**
   * Генерация процедурных графических элементов на сцене
   */
  private generateSprites() {
    if (!this.app || !this.container) return

    const targetCount = this.spriteCount.value
    const currentCount = this.container.children.length

    if (currentCount < targetCount) {
      // Создаем процедурную текстуру (неоновый квадрат с обводкой)
      const graphics = new PIXI.Graphics()
        .rect(-15, -12, 30, 30)
        .fill({ color: 0x00b4d8, alpha: 0.8 })
        .stroke({ width: 2, color: 0xffffff })

      const texture = this.app.renderer.generateTexture(graphics)

      for (let i = currentCount; i < targetCount; i++) {
        const sprite = new PIXI.Sprite(texture)

        // Рандомно распределяем по экрану
        sprite.x = Math.random() * this.app.screen.width
        sprite.y = Math.random() * this.app.screen.height
        sprite.anchor.set(0.5)

          // Записываем кастомные свойства для анимации прямо в объект
          ; (sprite as any).rotationSpeed = (Math.random() - 0.5) * 0.02
          ; (sprite as any).directionX = (Math.random() - 0.5) * 2
          ; (sprite as any).directionY = (Math.random() - 0.5) * 2

        // Применяем текущий масштаб из сигнала
        sprite.scale.set(this.spriteScale.value)

        this.container.addChild(sprite)
      }
      graphics.destroy()
    } else if (currentCount > targetCount) {
      // Удаляем лишние элементы из сцены и высвобождаем память
      const removed = this.container.removeChildren(targetCount)
      removed.forEach(child => child.destroy())
    }
  }

  /**
   * Цикл обновления каждого кадра (PixiJS Ticker Loop)
   */
  private animate = (ticker: PIXI.Ticker) => {
    if (!this.container || !this.app) return

    // Извлекаем реактивную скорость. Изменение ползунка мгновенно ускорит/замедлит GPU-цикл
    const speedMultiplier = this.speed.value

    this.container.children.forEach((child: any) => {
      // Вращение
      child.rotation += child.rotationSpeed * speedMultiplier * ticker.deltaTime

      // Движение по осям
      child.x += child.directionX * speedMultiplier * ticker.deltaTime
      child.y += child.directionY * speedMultiplier * ticker.deltaTime

      // Коллизии с границами экрана (отскоки)
      if (child.x < 0 || child.x > this.app!.screen.width) child.directionX *= -1
      if (child.y < 0 || child.y > this.app!.screen.height) child.directionY *= -1
    })
  }

  /**
   * Троттлинг изменения размеров контейнера для PixiJS холста
   */
  private startResizeTracking(container: HTMLDivElement) {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // ЗАЩИТА: Проверяем, что массив contentBoxSize существует и не пуст
        if (!entry.contentBoxSize || entry.contentBoxSize.length === 0) continue

        // ИСПРАВЛЕНИЕ: Берем свойства inlineSize и blockSize у ПЕРВОГО элемента массива
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

  // Публичные экшены для изменения сигналов из UI
  public setSpeed(value: number) { this.speed.value = value }
  public setScale(value: number) { this.spriteScale.value = value }
  public setCount(value: number) { this.spriteCount.value = value }

  /**
   * Деструктор сцены PixiJS v8 с безопасной очисткой ресурсов
   */
  /**
 * Деструктор сцены PixiJS v8 с безопасной очисткой ресурсов
 */
  public destroyPixi = () => {
    this.cleanupEffects()

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.resizeThrottleTimeout) {
      clearTimeout(this.resizeThrottleTimeout)
      this.resizeThrottleTimeout = null
    }

    if (this.app) {
      try {
        this.app.ticker?.remove(this.animate)

        // Безопасное уничтожение инстанса PixiJS v8
        this.app.destroy({
          removeView: true
        })
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
