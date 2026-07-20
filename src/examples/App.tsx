import baseClasses from './baseClasses.common.module.scss'
import clsx from 'clsx'
import { CardModalWrapper } from './shared'
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
          <CardModalWrapper
            title='Example 01'
            description='Counter'
          >
            <Example01 />
          </CardModalWrapper>
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>1. Computed</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 10'
            description='Counter & Doubled value'
          >
            <Example10 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 11'
            // footerText=''
            description='useReactiveValue hook (subscribed to Example 21)'
          >
            <Example11 />
          </CardModalWrapper>
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>2. Resource</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 20'
            description='Resource example'
          >
            <Example20 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 21'
            footerText='Account data request for person list 👉 Person id should be selected 👉 Person data request'
            description='Multi resource chaining example & observer hoc MobX like'
            useTwoColumns
          >
            <Example21 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 22'
            description='Resource exponential backoff example (incorrect url)'
            footerText='Incorrect url 👉 Retry x4 👉 HTTP error 404'
          >
            <Example22 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 23'
            description='Resource timeout example (response delay 15s)'
            footerText='4 requests (1 start + 3 retry) of 2.5 seconds each + ~7 seconds of total sleep in between 👉 Total error after ~17 seconds'
          >
            <Example23 />
          </CardModalWrapper>
        </div>
      </div>

    </div>
  )
}
