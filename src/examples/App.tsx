import './reset-styles.css'
import baseClasses from './baseClasses.common.module.scss'
import clsx from 'clsx'
import { Example01 } from './01-signal/Example01'
import { Example10 } from './10-computed/Example10'
import { Example20 } from './20-resource/Example20'
import { Example21 } from './21-multi-resource'

export const App = () => {
  return (
    <div className={clsx(baseClasses.appWrapper)}>
      <Example01 />
      <Example10 />
      <Example20 />
      <Example21 />
    </div>
  )
}
