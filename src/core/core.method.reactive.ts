/**
 * Изолированная фабрика глубоких реактивных Proxy-объектов графа.
 * Полностью отвязана от лексического контекста класса для абсолютной чистоты V8.
 */
export function createReactive<T extends object>(
  engine: any,
  target: T,
  name?: string
): T {
  if (engine.proxyTargets.has(target)) return target as any
  if (engine.proxyCache.has(target)) return engine.proxyCache.get(target) as any
  if (!engine.reactiveSignals.has(target)) engine.reactiveSignals.set(target, new Map())
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
      if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') return Reflect.get(t, prop, receiver)
      
      let sig = signalsMap.get(prop)
      if (!sig) {
        sig = engine.signal(Reflect.get(t, prop))
        signalsMap.set(prop, sig)
      }
      const val = sig.value
      if (engine.activeConsumer) engine.log({ type: 'reactive', label: `Read ${name || ''}.${String(prop)}`, details: { to: val } })
      if (val !== null && typeof val === 'object') return engine.reactive(val, name ? `${name}.${String(prop)}` : String(prop))
      return val
    },
    set(t: T, prop: string | symbol, value: any, receiver: any) {
      const rawValue = engine.proxyTargets.has(value) ? value : value
      const oldValue = Reflect.get(t, prop)
      if (oldValue === rawValue && prop !== 'length') return true
      Reflect.set(t, prop, rawValue)
      
      let sig = signalsMap.get(prop)
      if (!sig) {
        sig = engine.signal(oldValue)
        signalsMap.set(prop, sig)
      }
      sig.value = rawValue
      if (Array.isArray(t) && prop !== 'length') {
        let lengthSig = signalsMap.get('length')
        if (lengthSig) lengthSig.value = t.length
      }
      return true
    }
  }

  const proxy = new Proxy(target, handler)
  engine.proxyCache.set(target, proxy)
  engine.proxyTargets.add(proxy)
  return proxy
}
