import kaplay, { KAPLAYCtx } from 'kaplay'
import { AbstractService } from '@pravosleva/reactive-engine'

export class Kaboom2DLogic extends AbstractService {
  // 1. БАЗОВЫЕ РЕАКТИВНЫЕ СИГНАЛЫ
  public currentCityId = this.createSignal<string>('moscow', 'kaboom:signal:city-id')
  public speed = this.createSignal<number>(1, 'kaboom:signal:speed')
  public spriteScale = this.createSignal<number>(1, 'kaboom:signal:scale')
  public spriteCount = this.createSignal<number>(30, 'kaboom:signal:count')

  // 2. ВЫЧИСЛЯЕМОЕ СВОЙСТВО COMPUTED
  public statusInfo = this.createComputed<string>(() => {
    const count = this.spriteCount.value
    const curSpeed = this.speed.value
    const scale = this.spriteScale.value
    return curSpeed === 0
      ? `Kaboom Scene: ${count} объектов | Движение приостановлено`
      : `Kaboom Scene: ${count} объектов | Скорость: ${curSpeed}x | Масштаб: ${scale.toFixed(1)}x`
  })

  // Внутренние инфраструктурные объекты
  private k: KAPLAYCtx | null = null
  private effectDisposers: (() => void)[] = []
  private resizeObserver: ResizeObserver | null = null
  private lastResizeTime = 0
  private resizeThrottleTimeout: ReturnType<typeof setTimeout> | null = null
  private memorySpeed = 1
  // private lastContainer: HTMLDivElement | null = null

  /**
   * Инициализация Kaboom (Kaplay)
   */
  public initializeKaboom = (canvasContainer: HTMLDivElement) => {
    // this.lastContainer = canvasContainer
    if (this.k) return

    // Инициализируем контекст внутри переданного div
    this.k = kaplay({
      root: canvasContainer,
      width: canvasContainer.clientWidth,
      height: canvasContainer.clientHeight,
      // ИСПРАВЛЕНИЕ: Убрали пустую строку, заменив на корректную прозрачность
      background: [0, 0, 0, 0],
      // backgroundAlpha: 0, // Устанавливаем 100% прозрачность холста WebGL
      logMax: 0,
      debug: false
    })

    const kContext = this.k

    // Кастомный игровой цикл обновления физики границ (отскоки)
    kContext.onUpdate('neon-square', (obj: any) => {
      if (obj.pos.x < 15 || obj.pos.x > kContext.width() - 15) {
        obj.velX *= -1
        obj.pos.x = obj.pos.x < kContext.width() / 2 ? 15 : kContext.width() - 15
      }
      if (obj.pos.y < 15 || obj.pos.y > kContext.height() - 15) {
        obj.velY *= -1
        obj.pos.y = obj.pos.y < kContext.height() / 2 ? 15 : kContext.height() - 15
      }

      obj.move(obj.velX, obj.velY)
    })

    this.generateSprites()
    this.initReactiveEffects()
    this.startResizeTracking(canvasContainer)
  }


  /**
   * Реактивная синхронизация сигналов движка с Kaboom
   */
  private initReactiveEffects() {
    this.cleanupEffects()

    // Эффект 1: Изменение количества элементов на сцене
    const countDisposer = this.engine.effect(() => {
      this.spriteCount.value
      this.generateSprites()
    }, 'kaboom:effect:sync-count')
    this.effectDisposers.push(countDisposer)

    // Эффект 2: Масштаб спрайтов на GPU
    const scaleDisposer = this.engine.effect(() => {
      const currentScale = this.spriteScale.value
      if (!this.k) return

      // Находим все объекты с тегом и меняем им масштаб атомарно
      this.k.get('neon-square').forEach((obj) => {
        obj.scale = this.k!.vec2(currentScale)
      })
    }, 'kaboom:effect:sync-scale')
    this.effectDisposers.push(scaleDisposer)

    // Эффект 3: Реактивное изменение глобальной скорости симуляции (time scale)
    const speedDisposer = this.engine.effect(() => {
      const targetSpeed = this.speed.value
      if (!this.k) return

      // В Kaboom встроен глобальный множитель времени k.debug.timeScale.
      // Метод k.dt() автоматически умножается на это значение, меняя скорость физики без рывков.
      this.k.debug.timeScale = targetSpeed
    }, 'kaboom:effect:sync-speed')
    this.effectDisposers.push(speedDisposer)
  }

  /**
   * Генерация или удаление спрайтов (Накопительный паттерн для пула тегов Kaboom)
   */
  private generateSprites() {
    if (!this.k) return

    const targetCount = this.spriteCount.value
    const currentSprites = this.k.get('neon-square')
    const currentCount = currentSprites.length

    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        // Создаем процедурный квадрат средствами разметки объектов Kaboom
        this.k.add([
          this.k.rect(30, 30),
          this.k.pos(
            this.k.rand(50, this.k.width() - 50),
            this.k.rand(50, this.k.height() - 50)
          ),
          this.k.color(0, 180, 216),
          this.k.outline(2, this.k.rgb(255, 255, 255)),
          this.k.anchor('center'),
          this.k.scale(this.spriteScale.value),
          // Регистрируем кастомный тег для поиска в get()
          'neon-square',
          // Добавляем кастомные свойства физических скоростей
          {
            velX: this.k.rand(-150, 150),
            velY: this.k.rand(-150, 150)
          }
        ])
      }
    } else if (currentCount > targetCount) {
      // Удаляем лишние элементы с конца массива
      const toRemove = currentSprites.slice(targetCount)
      toRemove.forEach((obj) => obj.destroy())
    }
  }

  /**
   * Троттлинг изменения размеров контейнера для Kaboom
   */
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
    // В Kaboom для динамического ресайза холста переприсваиваются размеры контекста
    if (!this.k) return

    // Обновляем физические размеры виртуального экрана игры
    // (В Kaboom v3000+ это автоматически подстраивает внутренние матрицы)
    const canvas = this.k.canvas
    if (canvas) {
      canvas.width = width
      canvas.height = height
    }
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

  /**
   * Полное удаление инстанса Kaboom из памяти
   */
  public destroyKaboom = () => {
    this.cleanupEffects()

    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.resizeThrottleTimeout) { clearTimeout(this.resizeThrottleTimeout); this.resizeThrottleTimeout = null; }

    if (this.k) {
      // Полностью уничтожаем контекст игры и удаляем сгенерированные canvas-элементы
      this.k.quit()
    }

    this.k = null
    // this.lastContainer = null
    this.lastResizeTime = 0
  }

  private cleanupEffects() {
    this.effectDisposers.forEach(dispose => dispose())
    this.effectDisposers = []
  }
}
