import * as THREE from 'three'
import { AbstractService } from '@pravosleva/reactive-engine'

/**
 * Инфраструктурный бизнес-сервис управления 3D-сценой Three.js.
 *
 * Класс полностью инкапсулирует в себе низкоуровневую логику работы с WebGL (создание сцены,
 * камеры, рендерера, управление мешами, освещением, а также очистку GPU-памяти при уничтожении).
 *
 * Взаимодействие с UI и анимационным циклом построено на декларативных принципах:
 * 1. Реактивные сигналы (`color`, `rotationSpeed`) служат входными параметрами для изменения 3D-объектов.
 * 2. Вычисляемое свойство `statusInfo` (`computed`) автоматически агрегирует состояние сцены для текстовых плашек.
 * 3. Локальный реактивный эффект (`3d:effect:sync-color`) осуществляет прямую мутацию свойств материалов
 *    Three.js в обход виртуального DOM React, обеспечивая максимальную производительность WebGL-рендеринга.
 *
 * @extends AbstractService
 */
export class Cube3DLogic extends AbstractService {
  public color = this.createSignal<string>('#1a73e8', '3d:signal:color')
  public rotationSpeed = this.createSignal<number>(1, '3d:signal:speed')

  public statusInfo = this.createComputed<string>(() => {
    const speed = this.rotationSpeed.value
    const colorName = this.color.value === '#1a73e8' ? 'Синий' : this.color.value === '#4caf50' ? 'Зелёный' : 'Красный'
    return speed === 0
      ? `Куб [Цвет: ${colorName} | Paused]`
      : `Куб [Цвет: ${colorName} | Speed: x${speed}]`
  })

  /**
   * Инстанс 3D-сцены Three.js, выступающий контейнером для всех визуализируемых объектов,
   * источников освещения и кастомных мешей куба.
   * @private
   * @type {THREE.Scene | null}
   */
  private scene: THREE.Scene | null = null

  /**
   * Перспективная камера сцены, определяющая угол обзора, соотношение сторон холста
   * и глубину отображения 3D-пространства.
   * @private
   * @type {THREE.PerspectiveCamera | null}
   */
  private camera: THREE.PerspectiveCamera | null = null

  /**
   * Нативный рендерер WebGL, отвечающий за отрисовку математической сцены на HTML5 холсте (Canvas)
   * с поддержкой сглаживания (anti-aliasing) и прозрачности.
   * @private
   * @type {THREE.WebGLRenderer | null}
   */
  private renderer: THREE.WebGLRenderer | null = null

  /**
   * 3D-объект (Mesh) куба, объединяющий в себе геометрическую структуру `BoxGeometry`
   * и физический материал `MeshStandardMaterial`.
   * @private
   * @type {THREE.Mesh | null}
   */
  private mesh: THREE.Mesh | null = null

  /**
   * Идентификатор текущего кадра анимации, возвращаемый методом `requestAnimationFrame`.
   * Используется для корректной остановки и прерывания цикла рендеринга (`cancelAnimationFrame`)
   * при размонтировании компонента.
   * @private
   * @type {number | null}
   */
  private animationFrameId: number | null = null

  /**
   * Накопительный массив функций очистки (disposers) для реактивных эффектов движка.
   * Вызов этих функций отписывает сервис от обновлений сигналов, предотвращая утечки памяти в ядре.
   * @private
   * @type {(() => void)[]}
   */
  private effectDisposers: (() => void)[] = []

  // Сохраняем скорость, которая была до нажатия на паузу (по умолчанию 1)
  private memorySpeed = 1

  /**
   * Инициализирует 3D-инфраструктуру Three.js и регистрирует реактивные связи.
   *
   * Метод выполняет первоначальную сборку WebGL-сцены внутри переданной DOM-ноды:
   * 1. Реализует паттерн защиты от повторной инициализации при частых рендерах React.
   * 2. Вычисляет физические размеры родительского контейнера и настраивает пропорции камеры.
   * 3. Создает нативный `WebGLRenderer`, подключает источники света и генерирует меш куба,
   *    задавая ему стартовый цвет напрямую из сигнала `this.color.value`.
   * 4. Монтирует сгенерированный элемент `<canvas>` в DOM-дерево.
   * 5. Запускает бесконечный цикл отрисовки кадров `requestAnimationFrame` (`this.animate()`).
   * 6. В финальной стадии активирует реактивный граф эффектов движка, обеспечивая
   *    атомарную синхронизацию сигналов с видеокартой в обход React.
   *
   * @public
   * @param {HTMLDivElement} container - DOM-контейнер, в который будет встроен холст WebGL.
   * @returns {void}
   */
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
  }

  /**
   * Инициализирует и регистрирует реактивные эффекты для точечной синхронизации данных с GPU.
   *
   * Метод настраивает атомарную связь между стейт-менеджером и объектами сцены:
   * 1. Гарантированно вычищает предыдущие зарегистрированные подписки через `cleanupEffects()`,
   *    предотвращая утечки памяти и дублирование коллбэков при Hot Reload.
   * 2. Создает реактивный эффект `3d:effect:sync-color`, который подписывается на сигнал `this.color.value`.
   * 3. Обеспечивает высокую производительность (60+ FPS): при мутации цвета эффект напрямую
   *    обращается к материалу меша `material.color.set()`, минуя механизмы Virtual DOM и
   *    тяжелые циклы рендеринга самого React.
   * 4. Сохраняет возвращенную функцию отписки (disposer) в массив `effectDisposers` для
   *    последующей корректной очистки ядра движка.
   *
   * @private
   * @returns {void}
   */
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

  /**
   * Внутренний бесконечный цикл анимации (Render Loop) 3D-сцены.
   *
   * Метод выполняется циклически на каждый кадр, синхронизируясь с частотой обновления
   * экрана монитора (обычно 60/120/144 Гц) с помощью нативного браузерного API:
   * 1. Рекурсивно регистрирует сам себя в `requestAnimationFrame`, сохраняя уникальный
   *    идентификатор кадра в свойство `animationFrameId` для последующей корректной остановки.
   * 2. Извлекает текущее значение из реактивного сигнала `this.rotationSpeed.value`
   *    без участия хуков React и пересчитывает шаг приращения угла (`deltaSpeed`).
   * 3. Изменяет углы вращения меша куба по осям X и Y, создавая эффект плавного вращения.
   * 4. Перерисовывает математическую сцену в WebGL-контексте холста через вызов метода `renderer.render()`.
   *
   * Использование прямого чтения `rotationSpeed.value` внутри цикла анимации позволяет
   * мгновенно изменять скорость вращения 3D-объекта (включая полную остановку при значении 0)
   * без задержек планировщика задач и без лишних рендеров UI-слоя.
   *
   * @private
   * @returns {void}
   */
  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate)

    if (this.mesh && this.renderer && this.scene && this.camera) {
      const deltaSpeed = 0.01 * this.rotationSpeed.value
      this.mesh.rotation.x += deltaSpeed
      this.mesh.rotation.y += deltaSpeed

      this.renderer.render(this.scene, this.camera)
    }
  }

  public changeColor(hexColor: string) {
    this.color.value = hexColor
  }

  public setSpeed(speed: number) {
    // Если выставляем не нулевую скорость — запоминаем её как актуальную рабочую
    if (speed !== 0) {
      this.memorySpeed = speed
    }
    this.rotationSpeed.value = speed
  }

  /**
   * Возобновить движение со скоростью, которая была до паузы
   */
  public resumeSpeed() {
    this.rotationSpeed.value = this.memorySpeed
  }

  /**
   * Выполняет полную очистку системных ресурсов 3D-сцены и освобождает память GPU.
   *
   * Метод является деструктором графического конвейера и решает критическую задачу
   * предотвращения утечек памяти (Memory Leaks) в WebGL:
   * 1. Гарантированно отписывает сервис от реактивных эффектов движка, вызывая `cleanupEffects()`.
   * 2. Прерывает бесконечный цикл анимации в браузере с помощью `cancelAnimationFrame`.
   * 3. Уничтожает нативный рендерер `WebGLRenderer` и бесследно удаляет элемент `<canvas>` из DOM.
   * 4. Принудительно освобождает видеопамять видеокарты (GPU), вызывая `.dispose()`
   *    для тяжелых структур данных — геометрии (`BoxGeometry`) и материала (`MeshStandardMaterial`).
   * 5. Зануляет внутренние ссылки класса, подготавливая объекты к сборке мусора (Garbage Collection).
   *
   * КОГДА И ПОЧЕМУ ОН ВЫЗЫВАЕТСЯ:
   * Метод вызывается автоматически из `cleanup`-функции (возвращаемого блока `return`)
   * хука `useEffect` внутри React-компонента `ThreeJsExample` строго в момент его
   * полного размонтирования (Unmount) с экрана.
   *
   * Основные сценарии вызова:
   * - Переход пользователя на другую страницу приложения (клиентский роутинг).
   * - Декларативное скрытие 3D-блока через условный рендеринг (`{showScene && <ThreeJsExample />}`).
   * - Срабатывание механизма Hot Reload / Fast Refresh в процессе локальной разработки Vite.
   * Без явного вызова этого деструктора контекст WebGL остался бы замороженным в памяти,
   * что со временем привело бы к падению вкладки браузера с ошибкой "Context Lost".
   *
   * @public
   * @returns {void}
   */
  public destroyScene = () => {
    this.cleanupEffects()

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
    }

    if (this.renderer) {
      this.renderer.dispose()
      this.renderer.domElement.remove()
    }

    if (this.mesh) {
      this.mesh.geometry.dispose()
        ; (this.mesh.material as THREE.Material).dispose()
    }

    this.scene = null
    this.camera = null
    this.renderer = null
    this.mesh = null
    this.animationFrameId = null
  }

  private cleanupEffects() {
    this.effectDisposers.forEach(dispose => dispose())
    this.effectDisposers = []
  }
}
