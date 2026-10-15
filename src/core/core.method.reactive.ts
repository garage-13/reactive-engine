/**
 * Изолированная фабрика глубоких реактивных Proxy-объектов графа.
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

      // ⚛️ ПАТТЕРН ПЕРЕХВАТА МЕТОДOВ МАССИВА (Vue 3 / Монолитный Батч)
      if (Array.isArray(t) && typeof prop === 'string' && ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(prop)) {
        return (...args: any[]) => {
          let result: any
          // Обертываем ВЕСЬ вызов деструктивного метода в один атомарный батч
          engine.batch(() => {
            result = (Reflect.get(t, prop) as Function).apply(receiver, args)

            // Форсированно пинаем сигнал длины и общего состояния массива
            let lengthSig = signalsMap.get('length')
            if (lengthSig) lengthSig.value = t.length

            // Пинаем все зарегистрированные индексы, так как они гарантированно сместились
            signalsMap.forEach((sig: any, key: string) => {
              if (key !== 'length') sig.value = Reflect.get(t, key)
            })
          })
          return result
        }
      }

      if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') return Reflect.get(t, prop, receiver)

      let sig = signalsMap.get(prop)
      if (!sig) {
        const rawValue = Reflect.get(t, prop)
        sig = engine.signal(rawValue)
        signalsMap.set(prop, sig)

        // ⚡ СВЕРХБЫСТРОЕ КЭШИРОВАНИЕ НАУЗЛЕ (O(1) Hot Path):
        // Обертываем объект в глубокий прокси строго ОДИН раз при инициализации сигнала свойства.
        if (rawValue !== null && typeof rawValue === 'object') {
          (sig as any)._proxyCache = engine.reactive(rawValue, name ? `${name}.${String(prop)}` : String(prop))
        }
      }

      // Если у сигнала закэширован глубокий прокси, мы считываем sig.value
      // (для автоматической регистрации consumer в графе), но возвращаем прокси-обертку!
      if ((sig as any)._proxyCache !== undefined) {
        sig.value
        return (sig as any)._proxyCache
      }

      return sig.value
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

      // Обновляем кэш прокси на узле, если в свойство записали совершенно новый объект
      if (rawValue !== null && typeof rawValue === 'object') {
        (sig as any)._proxyCache = engine.reactive(rawValue, name ? `${name}.${String(prop)}` : String(prop))
      } else {
        (sig as any)._proxyCache = undefined
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
