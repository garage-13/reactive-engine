import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, SignalOptions } from './types'

export function createSignal<T>(
  engine: any,
  initialValue: T,
  optionsOrName?: SignalOptions<T> | string
): Signal<T> {
  let value = initialValue
  let version = 0
  let name = typeof optionsOrName === 'string' ? optionsOrName : optionsOrName?.name

  const extracted = !!name ? getExtractedValues({
    tested: [name],
    expectedKey: 'CORE_INTERNAL_SIGNAL',
    valueType: 'number',
  })?.[0] : null
  const isInternalCoreSignal = extracted && extracted === '1'

  const subscribers = new Set<any>()

  let hasBatchValue = false
  let batchInitialValue: T = initialValue

  const signalNode = {
    type: 'signal',
    get version() { return version },
    subscribers
  }

  const notifySubscribers = (parentState: number = 2) => {
    for (const sub of subscribers) {
      const rawSub = sub._node || sub
      if (rawSub.type === 'effect') {
        rawSub.isDirty = true
        engine.scheduleEffect(sub)
      } else if (rawSub.type === 'computed') {
        if (rawSub.markDirty) rawSub.markDirty(parentState)
      } else {
        if (typeof sub === 'function') {
          try { sub(value) } catch (err) { console.error(err) }
        } else if (sub && typeof sub.run === 'function') {
          try { sub.run() } catch (err) { console.error(err) }
        }
      }
    }
  }

  const signalInstance: Signal<T> = {
    get value() {
      const consumer = engine.activeConsumer
      if (consumer) {
        subscribers.add(engine.activeConsumer)
        engine.activeConsumer.dependencies.add(signalInstance)

        const consumerRaw = consumer._node || consumer
        if (consumerRaw.depth !== undefined && consumerRaw.depth === 1) {
          consumerRaw.depth = 2
        }

        if (consumer.activeRunId !== undefined) {
          (signalInstance as any)._lastSeenInRunId = consumer.activeRunId
        }
      }
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

      if (engine.batchDepth > 0) {
        if (!hasBatchValue) {
          hasBatchValue = true
          batchInitialValue = value
        }
        value = newValue

        ;(signalInstance as any).hasBatchValue = true
        notifySubscribers(1) // Мягкая маркировка CHECK (1) интра-ран чтений батча

        engine.batchedSignals.add(signalInstance)
        return
      }

      const oldValue = value
      value = newValue

      version++
      engine.epoch++

      notifySubscribers(2)
      if (engine.batchDepth === 0) engine.flushEffects()
    },

    get version() { return version },
    type: 'signal',

    subscribe(cb: (val: T) => void) {
      subscribers.add(cb)
      cb(value)
      return () => { subscribers.delete(cb) }
    },

    // ⚛️ ФАЗА 1: Чистая фиксация новых версий
    _applyBatchValue: () => {
      if (!hasBatchValue) return false
      const wasChanged = !Object.is(batchInitialValue, value) || (value !== null && typeof value === 'object')
      if (wasChanged) {
        version++
        return true
      }
      return false
    },

    // ⚛️ ФАЗА 2: Чистый атомарный push-уведомитель
    _flushBatch: (wasChanged: boolean, isAlreadyEpochShifted?: boolean) => {
      if (!hasBatchValue) return

      if (wasChanged) {
        if (!isAlreadyEpochShifted) {
          engine.epoch++
        }
        // ⚛️ КAНОНИЧЕСКИЙ БАТЧИНГ: Переводим в CHECK (1) вместо DIRTY (2).
        // Это блокирует веерные перезапуски сирот и алмазов на выходе из батча!
        notifySubscribers(1)
      } else {
        notifySubscribers(0)
      }

      hasBatchValue = false
      ;(signalInstance as any).hasBatchValue = false
      batchInitialValue = value
    }

  } as any

  ;(signalInstance as any)._node = signalNode
  ;(signalInstance as any).subscribers = subscribers
  return signalInstance
}
