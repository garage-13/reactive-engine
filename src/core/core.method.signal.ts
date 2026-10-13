import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, CleanupFn, SignalOptions } from './types'

export function createSignal<T>(
  engine: any,
  initialValue: T,
  optionsOrName?: string | SignalOptions<T>
): Signal<T> {
  let value = initialValue
  let version = 0
  const subscribers = new Set<any>()
  const name = typeof optionsOrName === 'string' ? optionsOrName : optionsOrName?.name || ''

  const isInternalCoreSignal = getExtractedValues({
    tested: [name],
    expectedKey: 'CORE_INTERNAL_SIGNAL',
    valueType: 'number',
  })?.[0] === '1' || false

  const signalNode = {
    subscribers,
    id: engine.subscriberId++,
    depth: 0,
    type: 'signal',
    get version() { return version }
  }

  const sigInstance = {
    get value() {
      if (engine.activeConsumer) {
        subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(signalNode)
      }
      return value
    },
    get valueWithoutTracking() {
      return value
    },
    set value(newValue: T) {
      const isObjectKick = value === newValue && value !== null && typeof value === 'object'
      if (Object.is(value, newValue) && !isObjectKick) return

      if (optionsOrName && typeof optionsOrName === 'object' && optionsOrName.validate) {
        const validation = optionsOrName.validate(newValue)
        if (validation !== true) {
          console.error(typeof validation === 'string' ? validation : '[Validation Error]')
          return
        }
      }

      const oldValue = value
      value = newValue

      version++
      engine.epoch++

      engine.log({
        type: 'signal',
        label: name || 'signal',
        details: { from: oldValue, to: newValue },
        isInternalCoreSignal
      })

      subscribers.forEach((sub: any) => {
        const rawSub = sub._node || sub

        if (rawSub.type === 'effect') {
          rawSub.isDirty = true
          engine.pendingEffects.add(sub)
        } else if (rawSub.type === 'computed') {
          if (rawSub.markDirty) rawSub.markDirty(2) // Сигналы пушат DIRTY (2)
        } else {
          rawSub.isDirty = true
        }
      })

      // СИНХРOННЫЙ ВЫЗОВ: Если глубина батча равна 0, немедленно выполняем флуш
      if (engine.batchDepth === 0) engine.flushEffects()
    },
    get version() { return version },
    subscribe(cb: (val: T) => void): CleanupFn {
      const fakeEffect: any = {
        id: engine.subscriberId++,
        isDirty: true,
        depth: 9999,
        dependencies: new Set(),
        type: 'effect',
        run: () => {
          if (fakeEffect.isDisposed) return
          try { cb(value) } catch (err) { console.error(err) }
        }
      }
      subscribers.add(fakeEffect)
      cb(value)
      return () => {
        fakeEffect.isDisposed = true
        subscribers.delete(fakeEffect)
      }
    }
  }

  ;(sigInstance as any)._node = signalNode
  return sigInstance as any
}
