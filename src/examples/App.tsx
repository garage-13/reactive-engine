import baseClasses from './ui.common.module.scss'
import clsx from 'clsx'
import { CardModalWrapper } from './shared'
import { Example001 } from './001-signal'
import { AudioPlayerExample as Example002 } from './002-signal-audioplayer'
import { Example100, Example101 } from './100-computed'
import { Example200 } from './200-resource'
import { Example201 } from './201-multi-resource'
import { Example202 } from './202-resource-exponential-backoff'
import { Example203 } from './203-resorce-timeout'
import { MapExample as Example204 } from './204-resource-gdebenz-and-leaflet'
import { MapExample as Example205 } from './205-resourse-gdebenz-and-leaflet-clusters'
import { MapExample as Example206 } from './206-resource-gdebenz-and-leaflet-clusters'
import { MapExample as Example207 } from './207-resource-gdebenz-and-leaflet-clusters'
import { MapExample as Example208 } from './208-resource-gdebenz-and-yandexmap'
import { MapExample as Example209 } from './209-resource-gdebenz-and-googlemaps'
import { MapExample as Example210 } from './210-resource-gdebenz-mapbox'

export const App = () => {
  return (
    <div className={clsx(baseClasses.stack4, baseClasses.appWrapper)}>

      <div className={baseClasses.stack0}>
        <h2>0. Signal</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 001'
            description='Counter'
          >
            <Example001 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 002'
            description='Audioplayer'
          >
            <Example002 />
          </CardModalWrapper>
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>1. Computed</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 100'
            description='Counter & Doubled value'
          >
            <Example100 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 101'
            description='useReactiveValue hook (subscribed to Example 201)'
          >
            <Example101 />
          </CardModalWrapper>
        </div>
      </div>

      <div className={baseClasses.stack0}>
        <h2>2. Resource</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 200'
            description='Resource example'
          >
            <Example200 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 201'
            footerText='Account data request for person list 👉 Person id should be selected 👉 Person data request'
            description='Multi resource chaining example & observer hoc MobX like'
            useTwoColumns
          >
            <Example201 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 202'
            description='Resource exponential backoff example (incorrect url)'
            footerText='Incorrect url 👉 Retry x4 👉 HTTP error 404'
          >
            <Example202 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 203'
            description='Resource timeout example (response delay 15s)'
            footerText='4 requests (1 start + 3 retry) of 2.5 seconds each + ~7 seconds of total sleep in between 👉 Total error after ~17 seconds'
          >
            <Example203 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 204'
            description='Leaflet'
          >
            <Example204 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 205'
            description='Leaflet with clusters'
          >
            <Example205 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 206'
            description='Leaflet with clusters & custom ui as DI service'
          >
            <Example206 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 207'
            description='Leaflet with clusters & custom ui as DI service & bbox signal'
          >
            <Example207 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 208'
            description='Yandex Maps'
          >
            <Example208 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 209'
            description='Google Maps'
          >
            <Example209 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 210'
            description='MapBox'
          >
            <Example210 />
          </CardModalWrapper>
        </div>
      </div>

    </div>
  )
}
