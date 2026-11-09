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
  const isInternalCoreSignal = !!name && getExtractedValues({
    tested: [name],
    expectedKey: 'CORE_INTERNAL_SIGNAL',
    valueType: 'number',
  })?.[0] === '1' || false
  const subscribers = new Set<any>()

  let hasBatchValue = false
  let batchInitialValue: T = initialValue

  const signalNode = {
    type: 'signal',
    get version() { return version },
    subscribers
  }

  const notifySubscribers = () => {
    for (const sub of subscribers) {
      const rawSub = sub._node || sub
      if (rawSub.type === 'effect') {
        rawSub.isDirty = true
        engine.scheduleEffect(sub)
      } else if (rawSub.type === 'computed') {
        if (rawSub.markDirty) rawSub.markDirty(2)
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
      const cleanupNode = engine.activeCleanupNode

      // ⚡ УЛЬТИМАТИВНЫЙ ФИКС TDD #229:
      // Мы отдаем старый снимок (снапшот) исключительно тогда, когда чтение сигнала
      // происходит НАПРЯМУЮ в теле деструктора (cleanupNode активен И сбор зависимостей
      // заморожен в untracked, то есть consumer === null).
      // Если же consumer !== null (например, идет pull-вычисление computed внутри очистки),
      // мы ОБЯЗАНЫ вернуть новое актуальное значение!
      if (cleanupNode && consumer === null && cleanupNode._snapshotValues) {
        if (cleanupNode._snapshotValues.has(signalInstance)) {
          return cleanupNode._snapshotValues.get(signalInstance)
        }
      }

      if (consumer) {
        if (consumer.dependencies && typeof consumer.dependencies.add === 'function') {
          subscribers.add(consumer)
          consumer.dependencies.add(signalInstance)

          // Сохраняем слепок текущего значения для будущей очистки этого консьюмера
          if (consumer._snapshotValues) {
            consumer._snapshotValues.set(signalInstance, value)
          }

          if (consumer.activeRunId !== undefined) {
            (signalInstance as any)._lastSeenInRunId = consumer.activeRunId
          }
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
        engine.batchedSignals.add(signalInstance)
        return
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

      notifySubscribers()
      if (engine.batchDepth === 0) engine.flushEffects()
    },

    get version() { return version },
    type: 'signal',

    subscribe(cb: (val: T) => void) {
      subscribers.add(cb)
      cb(value)
      return () => { subscribers.delete(cb) }
    },

    _flushBatch: () => {
      if (!hasBatchValue) return

      const wasChanged = !Object.is(batchInitialValue, value) || (value !== null && typeof value === 'object')

      if (wasChanged) {
        version++
        engine.epoch++

        engine.log({
          type: 'signal',
          label: name || 'signal_batched',
          details: { from: batchInitialValue, to: value },
          isInternalCoreSignal
        })

        for (const sub of subscribers) {
          const rawSub = sub._node || sub
          if (rawSub.type === 'effect') {
            rawSub.isDirty = true
            engine.scheduleEffect(sub)
          } else if (rawSub.markDirty) {
            rawSub.markDirty(2)
          } else if (typeof sub === 'function') {
            try { sub(value) } catch (err) { console.error(err) }
          }
        }
      }

      hasBatchValue = false
      batchInitialValue = value
    },

    get hasBatchValue() { return hasBatchValue },

    destroy: () => {
      if (subscribers) {
        subscribers.clear()
      }
      if (engine.batchedSignals) {
        engine.batchedSignals.delete(signalInstance)
      }
      hasBatchValue = false
      value = undefined as any
      batchInitialValue = undefined as any
    }
  } as any

  ;(signalInstance as any)._node = signalNode
  ;(signalInstance as any).subscribers = subscribers
  return signalInstance
}
