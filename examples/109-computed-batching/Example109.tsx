import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import clsx from 'clsx'

// 1. Описываем каскадную бизнес-логику для демонстрации батчинга
class ClusterLogic extends AbstractService {
  // Базовый источник данных
  public count = this.engine.signal<number>(1, 'example-109:signal:count');

  // Цепочка вычислений по принципу "Домино"
  // Каждое следующее свойство реактивно зависит от предыдущего computed!
  public computedA = this.engine.computed<number>(() => {
    return this.count.value + 10;
  }, 'example-109:computed:step-A');

  public computedB = this.engine.computed<number>(() => {
    return this.computedA.value * 2;
  }, 'example-109:computed:step-B');

  public computedC = this.engine.computed<number>(() => {
    return this.computedB.value - 5;
  }, 'example-109:computed:step-C');

  public computedD = this.engine.computed<string>(() => {
    return this.computedC.value % 2 === 0 ? 'Четное' : 'Нечетное';
  }, 'example-109:computed:step-D');

  // Экшен, совершающий ОДНО синхронное изменение, запускающее каскад
  public triggerClusterTick = () => {
    this.count.value += 1;
  }
}

// 2. Инициализируем движок с логгером
const engine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: true,
    filter: /^example-109.*/ // Фильтруем логи строго для этого примера
  }
})

export const Example109 = () => {
  const logic = engine.inject(ClusterLogic)

  // Оформляем подписки через useSyncExternalStore (engine.use)
  const count = engine.use(logic.count)
  const valA = engine.use(logic.computedA)
  const valB = engine.use(logic.computedB)
  const valC = engine.use(logic.computedC)
  const valD = engine.use(logic.computedD)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)} style={{ width: '650px' }}>
      <div className={baseClasses.absoluteUnitLabel}>Microtask Cluster Show (Example 109)</div>

      <div className={baseClasses.stack1} style={{ fontFamily: 'system-ui' }}>
        <div>🔢 Базовый сигнал: <span style={{ color: '#00b4d8' }}>{count}</span></div>
        <div>➡️ Шаг A (count + 10): <span>{valA}</span></div>
        <div>➡️ Шаг B (stepA * 2): <span>{valB}</span></div>
        <div>➡️ Шаг C (stepB - 5): <span>{valC}</span></div>
        <div>🏁 Шаг D (Результат): <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{valD}</span></div>
      </div>

      <div className={baseClasses.catSection}>
        <button
          onClick={logic.triggerClusterTick}
          className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
        >
          💥 ЗАПУСТИТЬ КАСКАД (1 КЛИК)
        </button>
      </div>
    </div>
  )
}
