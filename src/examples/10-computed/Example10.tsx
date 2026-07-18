import baseClasses from '../baseClasses.common.module.scss'
import btnClasses from '../baseClasses.buttons.module.scss'
import { BaseREService } from '../../BaseREService'
import { ReactiveEngine } from '../../core'
import clsx from 'clsx';

class Logic extends BaseREService {
  public counter = this.engine.signal<number>(0, 'example-1:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-1:computed:counter');

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example10 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>example 10 | Computed</div>
      <code>{counter} | x2 = {logic.doubledCounter.value}</code>
      <div className={baseClasses.catSection}>
        <button onClick={() => logic.inc()} className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>INC</button>
      </div>
    </div>
  )
}
