/**
 * Изолированная фабрика глубоких реактивных Proxy-объектов графа.
 */

// ⚡ ОПТИМИЗАЦИЯ СКОРОСТИ O(1) (Направление 1):
// Выносим деструктивные методы массивов в статический инлайн-объект.
// Это избавляет V8 от необходимости собирать массивы и вызывать .includes() на каждом геттере.
const DESTRUCTIVE_ARRAY_METHODS: Record<string | symbol, boolean> = {
  push: true,
  pop: true,
  shift: true,
  unshift: true,
  splice: true,
  sort: true,
  reverse: true
}

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

      // ⚡ ОПТИМИЗАЦИЯ O(1) (Направление 1):
      // Мгновенная проверка по хэш-мапе за константное время вместо .includes()
      if (Array.isArray(t) && typeof prop === 'string' && DESTRUCTIVE_ARRAY_METHODS[prop]) {
        return (...args: any[]) => {
          let result: any
          engine.batch(() => {
            // Оптимизация: прямой вызов метода нативного прототипа
            result = (t as any)[prop].apply(receiver, args)

            let lengthSig = signalsMap.get('length')
            if (lengthSig) lengthSig.value = t.length

            signalsMap.forEach((sig: any, key: string) => {
              if (key !== 'length') sig.value = (t as any)[key]
            })
          })
          return result
        }
      }

      // ⚡ ОПТИМИЗАЦИЯ СКОРОСТИ (Направление 2):
      // Быстрый плоский ленивый выход для системных символов без вызова Reflect.get
      if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
        return (t as any)[prop]
      }

      let sig = signalsMap.get(prop)
      if (!sig) {
        // ⚡ ОПТИМИЗАЦИЯ (Направление 2): Заменяем Reflect.get на прямое чтение из кучи t[prop]
        const rawValue = (t as any)[prop]
        sig = engine.signal(rawValue)
        signalsMap.set(prop, sig)

        if (rawValue !== null && typeof rawValue === 'object') {
          sig._proxyCache = engine.reactive(rawValue, name ? `${name}.${String(prop)}` : String(prop))
        }
      }

      if (sig._proxyCache !== undefined) {
        sig.value // Честная регистрация ребра для сохранения топологии глубины веток
        return sig._proxyCache
      }

      return sig.value
    },

    set(t: T, prop: string | symbol, value: any, receiver: any) {
      const rawValue = engine.proxyTargets.has(value) ? value : value
      // ⚡ ОПТИМИЗАЦИЯ: Прямой доступ к старому значению
      const oldValue = (t as any)[prop]

      if (oldValue === rawValue && prop !== 'length') return true

      // Нативное присвоение свойства объекта
      ;(t as any)[prop] = rawValue

      let sig = signalsMap.get(prop)
      if (!sig) {
        sig = engine.signal(oldValue)
        signalsMap.set(prop, sig)
      }

      sig._proxyCache = undefined
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
