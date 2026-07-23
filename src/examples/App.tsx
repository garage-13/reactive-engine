import baseClasses from './ui.common.module.scss'
import clsx from 'clsx'
import { CardModalWrapper } from './shared'
import { Example001 } from './001-signal'
import { AudioPlayerExample as Example002 } from './002-signal-audioplayer'
import { Example100 } from './100-computed'
import { Example101 } from './101-computed'
import { ThreeJsExample as Example102 } from './102-computed-threejs'
import { Pixi2DExample as Example103 } from './103-computed-pixijs'
import { Phaser2DExample as Example104 } from './104-computed-phaserjs'
import { Kaboom2DExample as Example105 } from './105-computed-kaboomjs'
import { HistoryStateExample as Example106 } from './106-computed-history-state'
import { MultiStepFormExample as Example107 } from './107-multistep-logic-di-undo-cache'
import { Example200 } from './200-resource'
import { Example201 } from './201-multi-resource'
import { Example202 } from './202-resource-exponential-backoff'
import { Example203 } from './203-resource-timeout'
import { MapExample as Example204 } from './204-resource-gdebenz-leaflet'
import { MapExample as Example205 } from './205-resourse-gdebenz-leaflet-clusters'
import { MapExample as Example206 } from './206-resource-gdebenz-leaflet-clusters'
import { MapExample as Example207 } from './207-resource-gdebenz-leaflet-clusters'
import { MapExample as Example208 } from './208-resource-gdebenz-yandexmaps'
import { MapExample as Example209 } from './209-resource-gdebenz-googlemaps'
import { MapExample as Example210 } from './210-resource-gdebenz-mapbox'
import { SearchExample as Example211 } from './211-resource-withDebounce'
import { Throttle2DExample as Example212 } from './212-resource-withThrottle'
import { ThrottleCacheExample as Example213 } from './213-resource-withThrottleAndCache'
// import { LiveNotificationsExample as Example214 } from './214-long-polling-as-while'
import { LiveNotificationsExample as Example215 } from './215-resource-withLongPolling'

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
          <CardModalWrapper
            title='Example 102'
            description='Three.js (3D engine)'
          >
            <Example102 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 103'
            description='Pixi.js (2D engine)'
          >
            <Example103 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 104'
            description='Phaser (2D engine)'
          >
            <Example104 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 105'
            description='Kaboom.js / Kaplay (2D engine)'
          >
            <Example105 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 106'
            description='LocalStorage Cache & State Undo Demo'
          >
            <Example106 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 107'
            description='Multi-Step Form (DI + Undo + Cache)'
          >
            <Example107 />
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
          <CardModalWrapper
            title='Example 211'
            description='withDebounce decorator'
          >
            <Example211 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 212'
            description='withThrottle decorator'
          >
            <Example212 />
          </CardModalWrapper>
          <CardModalWrapper
            title='Example 213'
            description='withThrottleAndCache decorator'
          >
            <Example213 />
          </CardModalWrapper>
          {/* <CardModalWrapper
            title='Example 214'
            description='Long polling'
          >
            <Example214 />
          </CardModalWrapper> */}
          <CardModalWrapper
            title='Example 215'
            description='Resource & withLongPolling decorator (experimental)'
          >
            <Example215 />
          </CardModalWrapper>
        </div>
      </div>

    </div>
  )
}
