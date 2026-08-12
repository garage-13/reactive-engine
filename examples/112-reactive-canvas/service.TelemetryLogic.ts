import { AbstractService, CleanupFn } from '@pravosleva/reactive-engine'

interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number;
    allocated: number;
    limit: number;
    percentage: number;
  };
  latency: number;
}

export class TelemetryLogic extends AbstractService {
  public metrics = this.engine.reactive<PerformanceMetrics>({
    fps: 60,
    memory: { used: 0, allocated: 0, limit: 0, percentage: 0 },
    latency: 0
  }, 'example-112:telemetry')

  public uiBridge = this.engine.computed(() => ({
    fps: this.metrics.fps,
    usedMem: this.metrics.memory.used,
    allocatedMem: this.metrics.memory.allocated,
    limitMem: this.metrics.memory.limit,
    memPercentage: this.metrics.memory.percentage,
    latency: this.metrics.latency
  }), 'example-112:computed:ui-bridge [IS_OPTIMIZED=1]')

  private isMonitoringStarted = false
  private leakStorage: string[] = []

  // Переменная для сохранения текущего мгновенного FPS
  private currentInstantFps = 60

  public startMonitoring() {
    if (this.isMonitoringStarted) return
    this.isMonitoringStarted = true

    let lastTick = performance.now()
    let frameCount = 0
    let fpsTimer = performance.now()

    const tick = (now: number) => {
      // Если мониторинг остановлен — НЕМЕДЛЕННО выходим!
      // Мы не меняем свойства прокси, не пушим логи и полностью гасим цепочку.
      if (!this.isMonitoringStarted) return

      // 1. Расчет латентности потока
      const delta = now - lastTick
      this.metrics.latency = Math.max(0, Math.round(delta - (1000 / 60)))
      lastTick = now

      // 🌟 ВЫЧИСЛЕНИЕ МГНOВЕННОГО FPS (Instant Delta FPS):
      // Если поток заблокирован, delta будет огромной (например, 200мс).
      // Формула 1000 / delta мгновенно выдаст честный "0" или "5" FPS для текущего кадра!
      this.currentInstantFps = delta > 0 ? Math.min(60, Math.round(1000 / delta)) : 60

      // 2. Секундное усреднение оставляем ТОЛЬКО для текстового индикатора в UI,
      // чтобы цифры на экране не мерцали хаотично перед глазами пользователя
      frameCount++
      if (now >= fpsTimer + 1000) {
        this.metrics.fps = Math.round((frameCount * 1000) / (now - fpsTimer))
        frameCount = 0
        fpsTimer = now
      }

      // Сбор данных о памяти
      const mem = (performance as any).memory
      if (mem) {
        const used = Math.round(mem.usedJSHeapSize / 1024 / 1024)
        const allocated = Math.round(mem.totalJSHeapSize / 1024 / 1024)
        const limit = Math.round(mem.jsHeapSizeLimit / 1024 / 1024)
        const percentage = limit > 0 ? Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100) : 0

        this.metrics.memory.used = used
        this.metrics.memory.allocated = allocated
        this.metrics.memory.limit = limit
        this.metrics.memory.percentage = percentage
      } else {
        const baseMemory = 60 + (this.leakStorage.length * 15)
        const fakeUsed = Math.round(baseMemory + Math.sin(now / 4000) * 5)
        this.metrics.memory.used = fakeUsed
        this.metrics.memory.allocated = Math.round(baseMemory * 1.5)
        this.metrics.memory.limit = 2048
        this.metrics.memory.percentage = Math.round((fakeUsed / 2048) * 100)
      }

      if (this.isMonitoringStarted) {
        requestAnimationFrame(tick)
      }
    }

    if (this.isMonitoringStarted) {
      requestAnimationFrame(tick)
    }
  }

  public connectCanvasPainter(canvas: HTMLCanvasElement): CleanupFn {
    const ctx = canvas.getContext('2d')
    if (!ctx) return () => { }

    const history: number[] = Array(60).fill(60)
    let isRunning = true
    let animationFrameId: number

    const renderLoop = () => {
      if (!isRunning) return

      // 🌟 ЧИСТАЯ PULL-МОДЕЛЬ НА МГНОВЕННЫХ ДАННЫХ:
      // Читаем из локальной переменной мгновенный FPS кадра.
      // Если Event Loop лежал — сюда прилетит честный ноль, и волна рухнет вниз!
      const fpsToDraw = this.currentInstantFps

      history.push(fpsToDraw)
      if (history.length > 60) history.shift()

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Сетка
      ctx.strokeStyle = '#22222a'
      ctx.lineWidth = 1
      for (let i = 0; i < canvas.height; i += 30) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke()
      }

      // Заливка градиента
      ctx.beginPath()
      ctx.moveTo(0, canvas.height)
      history.forEach((fps, index) => {
        const x = (index / 59) * canvas.width
        const y = canvas.height - (fps / 60) * canvas.height
        ctx.lineTo(x, y)
      })
      ctx.lineTo(canvas.width, canvas.height)
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, 'rgba(66, 184, 131, 0.25)')
      gradient.addColorStop(1, 'rgba(66, 184, 131, 0.0)')
      ctx.fillStyle = gradient
      ctx.fill()

      // Линия графика
      ctx.beginPath()
      history.forEach((fps, index) => {
        const x = (index / 59) * canvas.width
        const y = canvas.height - (fps / 60) * canvas.height
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#42b883'
      ctx.lineWidth = 2
      ctx.stroke()

      animationFrameId = requestAnimationFrame(renderLoop)
    }

    animationFrameId = requestAnimationFrame(renderLoop)

    return () => {
      isRunning = false
      cancelAnimationFrame(animationFrameId)
    }
  }

  // Нагрузочные экшены (оставляем без изменений)
  public leakMemory = () => {
    for (let i = 0; i < 5; i++) {
      this.leakStorage.push(new Array(6000000).join('x'))
    }
  }

  public blockEventLoop = () => {
    const start = performance.now()
    while (performance.now() < start + 200) {
      Math.random()
    }
  }

  public triggerGarbageCollection = () => {
    this.leakStorage = []
  }

  public destroy() {
    this.isMonitoringStarted = false // Мгновенно блокирует выполнение текущего кадра tick()
    this.uiBridge.destroy()          // Удаляет computed-мост из реестра эффектов ядра
    this.leakStorage = []            // Зануляет массив утечек

    // 🌟 ЖЕСТКАЯ ЗАЧИСТКА БУФЕРА:
    // Если в текущем тике микрозадачи успели скопиться «хвостовые» логи,
    // мы принудительно очищаем массив логгера ядра, исключая появление логов-призраков в консоли!
    if ((this.engine as any).pendingLogQueue) {
      (this.engine as any).pendingLogQueue = []
    }
  }
}
