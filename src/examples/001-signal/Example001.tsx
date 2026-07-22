import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { BaseREService } from '../../BaseREService'
import { ReactiveEngine } from '../../core'
import clsx from 'clsx';

class Logic extends BaseREService {
  public counter = this.engine.signal<number>(0, 'example-01:signal:counter');

  public inc() {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Signal example</div>
      <code>{counter}</code>
      <div className={baseClasses.catSection}>
        <button onClick={() => logic.inc()} className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}>INC</button>
      </div>
    </div>
  )
}
