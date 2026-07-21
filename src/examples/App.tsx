import baseClasses from './baseClasses.common.module.scss'
import clsx from 'clsx'
import { CardModalWrapper } from './shared'
import { Example01 } from './01-signal'
import { Example10, Example11 } from './10-computed'
import { Example20 } from './20-resource'
import { Example21 } from './21-multi-resource'
import { Example22 } from './22-resource-exponential-backoff'
import { Example23 } from './23-resorce-timeout'
import { MapExample as Example24 } from './24-resource-gdebenz-and-leaflet'
import { MapExample as Example25 } from './25-resourse-gdebenz-and-leaflet-clusters'
import { MapExample as Example26 } from './26-resource-gdebenz-and-leaflet-clusters'
import { MapExample as Example27 } from './27-resource-gdebenz-and-leaflet-clusters'
import { MapExample as Example28 } from './28-resource-gdebenz-and-yandexmap'
import { MapExample as Example29 } from './29-resource-gdebenz-and-googlemaps'

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
          <CardModalWrapper
            title='Example 24'
            description='Leaflet exp'
          >
            <Example24 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 25'
            description='Leaflet exp (with clusters)'
          >
            <Example25 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 26'
            description='Leaflet exp (with clusters) & custom ui as DI service'
          >
            <Example26 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 27'
            description='Leaflet exp (with clusters) & custom ui as DI service & bbox signal'
          >
            <Example27 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 28'
            description='Yandex maps exp'
          >
            <Example28 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 29'
            description='Google Maps API (Dynamic Loader + Clusters + Reactive state)'
          >
            <Example29 />
          </CardModalWrapper>
        </div>
      </div>

    </div>
  )
}
