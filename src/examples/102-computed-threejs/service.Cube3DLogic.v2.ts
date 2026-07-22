import * as THREE from 'three'
import { BaseREService } from '../../BaseREService'

export class Cube3DLogic extends BaseREService {
  public color = this.createSignal<string>('#1a73e8', '3d:signal:color')
  public rotationSpeed = this.createSignal<number>(1, '3d:signal:speed')

  public statusInfo = this.createComputed<string>(() => {
    const speed = this.rotationSpeed.value
    const colorName = this.color.value === '#1a73e8' ? 'Синий' : this.color.value === '#4caf50' ? 'Зелёный' : 'Красный'
    return speed === 0
      ? `Куб [Цвет: ${colorName} | Paused]`
      : `Куб [Цвет: ${colorName} | Speed: x${speed}]`
  })

  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private mesh: THREE.Mesh | null = null
  private animationFrameId: number | null = null
  private effectDisposers: (() => void)[] = []
  private memorySpeed = 1

  // Инфраструктура для адаптивности и троттлинга
  private resizeObserver: ResizeObserver | null = null
  private lastResizeTime = 0
  private resizeThrottleTimeout: ReturnType<typeof setTimeout> | null = null

  public initializeScene = (container: HTMLDivElement) => {
    if (this.scene) return

    const width = container.clientWidth
    const height = container.clientHeight

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    this.camera.position.z = 5

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setSize(width, height)
    container.appendChild(this.renderer.domElement)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 5, 5)
    this.scene.add(ambientLight, directionalLight)

    const geometry = new THREE.BoxGeometry(2, 2, 2)
    const material = new THREE.MeshStandardMaterial({ color: this.color.value })
    this.mesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.mesh)

    this.animate()
    this.initReactiveEffects()

    // Инициализируем и запускаем ResizeObserver на контейнер
    this.startResizeTracking(container)
  }

  private initReactiveEffects() {
    this.cleanupEffects()
    const colorDisposer = this.engine.effect(() => {
      const nextColor = this.color.value
      if (this.mesh) {
        const material = this.mesh.material as THREE.MeshStandardMaterial
        material.color.set(nextColor)
      }
    }, '3d:effect:sync-color')
    this.effectDisposers.push(colorDisposer)
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate)
    if (this.mesh && this.renderer && this.scene && this.camera) {
      const deltaSpeed = 0.01 * this.rotationSpeed.value
      this.mesh.rotation.x += deltaSpeed
      this.mesh.rotation.y += deltaSpeed
      this.renderer.render(this.scene, this.camera)
    }
  }

  /**
   * Инициализация ResizeObserver с кастомным троттлингом (ограничение до 50мс)
   */
  private startResizeTracking(container: HTMLDivElement) {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Извлекаем точные динамические размеры контент-бокса элемента
        const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0]

        const now = Date.now()
        const throttleLimit = 50 // Интервал троттлинга в мс (~20 кадров в секунду для ресайза)

        if (this.resizeThrottleTimeout) {
          clearTimeout(this.resizeThrottleTimeout)
        }

        // Если с прошлого ресайза прошло больше 50мс — обновляем мгновенно
        if (now - this.lastResizeTime >= throttleLimit) {
          this.handleResize(width, height)
          this.lastResizeTime = now
        } else {
          // Иначе откладываем вызов на остаток времени, чтобы зафиксировать финальный размер
          this.resizeThrottleTimeout = setTimeout(() => {
            this.handleResize(width, height)
            this.lastResizeTime = Date.now()
          }, throttleLimit - (now - this.lastResizeTime))
        }
      }
    })

    this.resizeObserver.observe(container)
  }

  /**
   * Внутренний метод пересчета матриц Three.js под новые размеры
   */
  private handleResize(width: number, height: number) {
    if (!this.renderer || !this.camera) return

    // 1. Обновляем пропорции (aspect ratio) камеры, чтобы куб не сжимался яйцом
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    // 2. Обновляем физический размер холста WebGL
    this.renderer.setSize(width, height)
  }

  public changeColor(hexColor: string) {
    this.color.value = hexColor
  }

  public setSpeed(speed: number) {
    if (speed !== 0) this.memorySpeed = speed
    this.rotationSpeed.value = speed
  }

  public resumeSpeed() {
    this.rotationSpeed.value = this.memorySpeed
  }

  /**
   * Полное уничтожение сцены (с учетом очистки таймеров и обсерверов)
   */
  public destroyScene = () => {
    this.cleanupEffects()

    // Снимаем подписку и уничтожаем ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    // Вычищаем остаточные таймауты троттлинга
    if (this.resizeThrottleTimeout) {
      clearTimeout(this.resizeThrottleTimeout)
      this.resizeThrottleTimeout = null
    }

    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId)
    if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    if (this.mesh) { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }

    this.scene = null
    this.camera = null
    this.renderer = null
    this.mesh = null
    this.animationFrameId = null
    this.lastResizeTime = 0
  }

  private cleanupEffects() {
    this.effectDisposers.forEach(dispose => dispose())
    this.effectDisposers = []
  }
}
