import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'
import clsx from 'clsx'

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-10:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-10:computed:counter');

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example100 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Computed</div>
      <code>{counter} | x2 = {logic.doubledCounter.value}</code>
      <div className={baseClasses.catSection}>
        <button
          onClick={() => logic.inc()}
          className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >INC</button>
      </div>
    </div>
  )
}
