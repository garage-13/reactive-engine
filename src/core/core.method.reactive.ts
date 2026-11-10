import type { ReactiveEngineCore } from './core'

/**
 * Изолированная фабрика глубоких реактивных Proxy-объектов графа.
 * Интегрирована со связными списками NodeLink и транзакционным логгером.
 */
export function createReactive<T extends object>(
  engine: ReactiveEngineCore,
  target: T,
  name?: string
): T {
  if (engine.proxyTargets.has(target)) return target
  if (engine.proxyCache.has(target)) return engine.proxyCache.get(target) as T

  if (!engine.reactiveSignals.has(target)) {
    engine.reactiveSignals.set(target, new Map<string | symbol, any>())
  }
  const signalsMap = engine.reactiveSignals.get(target)!

  const handler: ProxyHandler<T> = {
    get(t: T, prop: string | symbol, receiver: any) {
      if (prop === '__subscribe' && Array.isArray(t)) {
        return (cb: () => void) => {
          let lengthSig = signalsMap.get('length')
          if (!lengthSig) {
            lengthSig = engine.signal(t.length)
            signalsMap.set('length', lengthSig)
          }
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

            let lengthSig = signalsMap.get('length')
            if (lengthSig) {
              lengthSig.value = t.length
            }

            signalsMap.forEach((sig: any, key: string | symbol) => {
              if (key !== 'length') {
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

        // ЛЕНИВОЕ КЭШИРОВАНИЕ НА ЧТЕНИИ (O(1) Hot Path)
        if (rawValue !== null && typeof rawValue === 'object') {
          (sig as any)._proxyCache = engine.reactive(
            rawValue,
            name ? `${name}.${String(prop)}` : String(prop)
          )
        }
      }

      if ((sig as any)._proxyCache !== undefined) {
        sig.value // Регистрация ребра NodeLink
        return (sig as any)._proxyCache
      }

      return sig.value
    },

    set(t: T, prop: string | symbol, value: any, receiver: any): boolean {
      const rawValue = value
      const oldValue = Reflect.get(t, prop)

      if (oldValue === rawValue && prop !== 'length') return true
      Reflect.set(t, prop, rawValue)

      let sig = signalsMap.get(prop)
      if (!sig) {
        sig = engine.signal(oldValue)
        signalsMap.set(prop, sig)
      }

      const label = name ? `${name}.${String(prop)}` : String(prop)
      engine.log({
        type: 'reactive',
        label,
        details: { from: oldValue, to: rawValue }
      });

      // СБРАСЫВАЕМ кэш прокси на узле для ленивой инвалидации геттера
      (sig as any)._proxyCache = undefined
      sig.value = rawValue

      if (Array.isArray(t) && prop !== 'length') {
        const lengthSig = signalsMap.get('length')
        if (lengthSig) {
          lengthSig.value = t.length
        }
      }
      return true
    }
  }

  const proxy = new Proxy(target, handler)
  engine.proxyCache.set(target, proxy)
  engine.proxyTargets.add(proxy)
  return proxy
}
