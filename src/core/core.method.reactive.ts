import type { ReactiveEngineCore } from './core'

export function createReactive<T extends object>(
  engine: ReactiveEngineCore,
  target: T,
  name?: string
): T {
  if (engine.proxyTargets.has(target)) return target
  if (engine.proxyCache.has(target)) return engine.proxyCache.get(target) as T

  // Логируем стартовую инициализацию реактивного Proxy-объекта (REACTIVE <name> (<target>))
  const rootLabel = name || 'reactive'
  engine.log({
    type: 'reactive',
    label: rootLabel,
    details: { to: target }
  })

  if (!engine.reactiveSignals.has(target)) {
    engine.reactiveSignals.set(target, new Map<string | symbol, any>())
  }
  const signalsMap = engine.reactiveSignals.get(target)!
  const OWN_KEYS_SYMBOL = Symbol('ownKeys')

  function getOrCreateSignal(prop: string | symbol, initialVal: any) {
    let sig = signalsMap.get(prop)
    if (!sig) {
      // Передаём флаг внутреннего сигнала, чтобы не дублировать логи REACTIVE записями SIGNAL
      sig = engine.signal(initialVal, {
        name: `${rootLabel}.${String(prop)}`,
        isInternalCoreSignal: true
      } as any)
      signalsMap.set(prop, sig)
    }
    return sig
  }

  const handler: ProxyHandler<T> = {
    ownKeys(t: T) {
      const keysSig = getOrCreateSignal(OWN_KEYS_SYMBOL, 0)
      keysSig.value
      return Reflect.ownKeys(t)
    },

    get(t: T, prop: string | symbol, receiver: any) {
      if (prop === '__subscribe' && Array.isArray(t)) {
        return (cb: () => void) => {
          const lengthSig = getOrCreateSignal('length', t.length)
          return lengthSig.subscribe(cb)
        }
      }

      if (
        Array.isArray(t) &&
        typeof prop === 'string' &&
        ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(prop)
      ) {
        return (...args: any[]) => {
          let result: any
          const label = name ? `${name}.${prop}` : `array.${prop}`
          const oldLength = t.length

          engine.batch(() => {
            const origMethod = Reflect.get(t, prop) as Function
            result = origMethod.apply(receiver, args)

            const lengthSig = getOrCreateSignal('length', t.length)
            lengthSig.value = t.length

            const keysSig = getOrCreateSignal(OWN_KEYS_SYMBOL, 0)
            keysSig.value = keysSig.valueWithoutTracking + 1

            signalsMap.forEach((sig: any, key: string | symbol) => {
              if (key !== 'length' && key !== OWN_KEYS_SYMBOL) {
                sig.value = Reflect.get(t, key)
              }
            })

            engine.log({
              type: 'reactive',
              label,
              details: { from: { length: oldLength }, to: { length: t.length } }
            })
          })
          return result
        }
      }

      if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
        return Reflect.get(t, prop, receiver)
      }

      let sig = signalsMap.get(prop)
      if (!sig) {
        const rawValue = Reflect.get(t, prop)
        sig = engine.signal(rawValue)
        signalsMap.set(prop, sig)

        if (rawValue !== null && typeof rawValue === 'object') {
          (sig as any)._proxyCache = engine.reactive(
            rawValue,
            name ? `${name}.${String(prop)}` : String(prop)
          )
        }
      }

      if ((sig as any)._proxyCache !== undefined) {
        sig.value
        return (sig as any)._proxyCache
      }

      return sig.value
    },

    set(t: T, prop: string | symbol, value: any): boolean {
      const hadKey = Object.prototype.hasOwnProperty.call(t, prop)
      const oldValue = Reflect.get(t, prop)

      if (hadKey && oldValue === value && prop !== 'length') return true
      Reflect.set(t, prop, value)

      const sig = getOrCreateSignal(prop, oldValue)

      const label = name ? `${name}.${String(prop)}` : String(prop)
      engine.log({
        type: 'reactive',
        label,
        details: { from: oldValue, to: value }
      })

      ;(sig as any)._proxyCache = undefined
      sig.value = value

      if (!hadKey) {
        const keysSig = getOrCreateSignal(OWN_KEYS_SYMBOL, 0)
        keysSig.value = keysSig.valueWithoutTracking + 1
      }

      if (Array.isArray(t) && prop !== 'length') {
        const lengthSig = getOrCreateSignal('length', t.length)
        lengthSig.value = t.length
      }
      return true
    },

    deleteProperty(t: T, prop: string | symbol): boolean {
      const hadKey = Object.prototype.hasOwnProperty.call(t, prop)
      const result = Reflect.deleteProperty(t, prop)
      if (hadKey && result) {
        const sig = signalsMap.get(prop)
        if (sig) {
          ;(sig as any)._proxyCache = undefined
          sig.value = undefined
        }
        const keysSig = getOrCreateSignal(OWN_KEYS_SYMBOL, 0)
        keysSig.value = keysSig.valueWithoutTracking + 1
      }
      return result
    }
  }

  const proxy = new Proxy(target, handler)
  engine.proxyCache.set(target, proxy)
  engine.proxyTargets.add(proxy)
  return proxy
}
