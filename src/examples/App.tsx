import baseClasses from './baseClasses.common.module.scss'
import clsx from 'clsx'
import { Example01 } from './01-signal'
import { Example10, Example11 } from './10-computed'
import { Example20 } from './20-resource'
import { Example21 } from './21-multi-resource'
import { Example22 } from './22-resource-exponential-backoff'
import { Example23 } from './23-resorce-timeout'

export const App = () => {
  return (
    <div className={clsx(baseClasses.stack4, baseClasses.appWrapper)}>

      <div className={baseClasses.stack0}>
        <h2>0. Signal</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <Example01 />
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>1. Computed</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <Example10 />
          <Example11 />
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>2. Resource</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <Example20 />
          <Example21 />
          <Example22 />
          <Example23 />
        </div>
      </div>

    </div>
  )
}
