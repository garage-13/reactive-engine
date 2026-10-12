import { getExtractedValues } from '../utils/getExtractedValues'
import { Signal, CleanupFn, SignalOptions } from './types'

/**
 * Изолированная фабрика сигналов реактивного графа.
 * Полностью отвязана от лексического контекста класса для абсолютной чистоты V8.
 */
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
  })?.toString() === '1' || false

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
    set value(newValue: T) {
      const isObj = value && typeof value === 'object'
      if (value === newValue && !isObj) return
      
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
      engine.log({ type: 'signal', label: name || 'signal', details: { from: oldValue, to: newValue }, isInternalCoreSignal })
      
      const markDirtyNode = (node: any) => {
        node.subscribers.forEach((sub: any) => {
          if (sub === engine.activeConsumer) return
          
          const wasDirty = sub.isDirty
          sub.isDirty = true
          
          if (sub.type === 'effect') {
            engine.pendingEffects.add(sub)
          } else {
            engine.pendingEffects.add(sub)
            // 🟢 ИСПРАВЛЕНО: Если подписчик — это компьютед, делегируем каскад инвалидации его нативному методу markDirty
            if (sub.markDirty) {
              sub.markDirty()
            } else if (!wasDirty && sub.subscribers) {
              markDirtyNode(sub)
            }
          }
        })
      }
      
      markDirtyNode(signalNode)
      if (engine.batchDepth === 0) engine.flushEffects()
    },
    get version() { return version },
    subscribe(cb: (val: T) => void): CleanupFn {
      const fakeEffect: any = {
        id: engine.subscriberId++,
        isDirty: true,
        depth: 9999,
        dependencies: new Set(),
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
