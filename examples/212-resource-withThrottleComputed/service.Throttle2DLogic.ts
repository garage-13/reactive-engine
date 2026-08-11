import { AbstractService, withThrottleComputed } from '@pravosleva/reactive-engine'

export class Throttle2DLogic extends AbstractService {
  // Сигнал, куда записываются сырые координаты X и Y при движении мыши
  public coordsSignal = this.createSignal<{ x: number; y: number }>({ x: 0, y: 0 }, 'example-212:signal:coords')

  // 1. Сырой сигнал мыши (спамит на каждый пиксель)
  public rawCoords = this.engine.signal({ x: 0, y: 0 }, 'example-212:signal:raw-coords');

  /**
   * 2.1 🚫 Альтернативный вариант (он тоже будет работать)
   * ☝️ НО НЕ для этого случая, когда оригинальный синал генерирует сотни изменений в секунду (спам),
   * т.к. чтение сырого сигнала требует неоправдано больше ресурсов для этого случая.
   * Реактивный ресурс, обёрнутый в декоратор withThrottle.
   * Он считывает координаты и выполняет "тяжёлый" фейковый расчёт зон.
   * Троттлинг гарантирует частоту выполнения не чаще 1 раза в 300 мс.
   */
  // public analyticsResource = this.engine.resource(
  //   withThrottle(
  //     async (coords, _abortSignal) => {
  //       // Имитируем небольшую задержку расчёта (например, обращение к гео-модели)
  //       await new Promise((resolve) => setTimeout(resolve, 100))
  //       const sector = coords.x < 200 ? 'Левый сектор' : 'Правый сектор'
  //       return `Аналитика GPU: [${sector}] для точки X: ${coords.x}, Y: ${coords.y}`
  //     },
  //     { limit: 300 } // Лимит троттлинга 300 мс
  //   ),
  //   this.coordsSignal,
  //   'example-212:resource:analytics'
  // )

  /**
   * 2.2 ✅ Ресурс слушает уже ЗАТРOТТЛЕННЫЙ сигнал.
   * Он перейдет в статус loading ровно 1 раз в 300мс! Счетчик изменений будет равен 1!
   */
  // Вычисляемый затроттленный сигнал (тикает строго 1 раз в 300мс)
  public throttledCoords = withThrottleComputed(
    this.engine,
    () => this.coordsSignal.value,
    { limit: 300 },
    '[IS_OPTIMIZED=1]:example-212:computed:throttled-coords'
  )
  public analyticsResource = this.engine.resource(
    async (coords) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const sector = coords.x < 200 ? 'Левый сектор' : 'Правый сектор';
      return `Аналитика GPU: [${sector}] для точки X: ${coords.x}, Y: ${coords.y}`;
    },
    this.throttledCoords,
    'example-212:resource:analytics'
  );

  /**
   * Экшен обновления координат из UI
   */
  public updateCoords(x: number, y: number) {
    this.coordsSignal.value = { x, y }
  }
}
