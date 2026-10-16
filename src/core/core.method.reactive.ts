import { SignalOptions } from './types'

export function createReactive<T extends object>(
  engine: any,
  target: T,
  name?: string
): T {
  if (target === null || typeof target !== 'object') {
    return target
  }

  // 1. Возвращаем уже существующий Proxy из кэша ядра
  if (engine.proxyCache.has(target)) {
    return engine.proxyCache.get(target) as T
  }
  if (engine.proxyTargets.has(target)) {
    return target
  }

  const signalMap = new Map<string | symbol, any>()
  engine.reactiveSignals.set(target, signalMap)

  // Внутренний скрытый сигнал длины для массивов
  let lenSignal: any = null
  if (Array.isArray(target)) {
    lenSignal = engine.signal(target.length, `[RE-INTERNAL]:len:${name || 'array'}`)
  }

  // ⚡ ВЫСОКОСКОРОСТНАЯ ИНСТРУМЕНТАЦИЯ НАТИВНЫХ МЕТОДОВ МАССИВОВ
  const arrayInstrumentations: Record<string | symbol, Function> = {
    push(...args: any[]) {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = Array.prototype.push.apply(rawTarget, args)
        if (lenSignal) lenSignal.value = rawTarget.length
        // Пинаем подписчиков на свойства
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    pop() {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = Array.prototype.pop.apply(rawTarget)
        if (lenSignal) lenSignal.value = rawTarget.length
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    shift() {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = Array.prototype.shift.apply(rawTarget)
        if (lenSignal) lenSignal.value = rawTarget.length
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    unshift(...args: any[]) {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = Array.prototype.unshift.apply(rawTarget, args)
        if (lenSignal) lenSignal.value = rawTarget.length
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    splice(...args: any[]) {
      const rawTarget = target as any
      return engine.batch(() => {
        // Приведение к any снимает строгую проверку кортежа аргументов [start, deleteCount]
        const res = (Array.prototype.splice as any).apply(rawTarget, args)
        if (lenSignal) lenSignal.value = rawTarget.length
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    reverse() {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = Array.prototype.reverse.apply(rawTarget)
        if (lenSignal) {
          lenSignal.value = rawTarget.length
        }

        // ⚛️ ЧЕСТНЫЙ ПЕРЕБОР ИНДЕКСОВ: Оповещаем подписчиков, которые следят за
        // конкретными элементами массива по числовым ключам (state.numbers[0])
        for (let i = 0; i < rawTarget.length; i++) {
          notifyKeyChange(rawTarget, String(i))
          notifyKeyChange(rawTarget, String(i))
        }

        notifyKeyChange(rawTarget, 'length')
        return res
      })
    },
    sort(compareFn?: (a: any, b: any) => number) {
      const rawTarget = target as any
      return engine.batch(() => {
        const res = (Array.prototype.sort as any).apply(rawTarget, [compareFn])
        if (lenSignal) lenSignal.value = rawTarget.length
        notifyKeyChange(rawTarget, 'length')
        return res
      })
    }
  }

  function notifyKeyChange(rawTarget: any, key: string | symbol) {
    const map = engine.reactiveSignals.get(rawTarget)
    if (map) {
      const sig = map.get(key)
      if (sig) {
        // Симулируем пинок изменения объекта самому себе через инкремент версии
        sig.value = (sig.value || 0) + 1
      }
    }
  }

  const handler: ProxyHandler<any> = {
    get(rawTarget, key, receiver) {
      if (key === '__isProxy') return true
      if (key === '_target') return rawTarget
      if (key === '_lenSignal') return lenSignal

      // Если это массив и вызывается деструктивный метод — отдаем атомарный мутатор
      if (Array.isArray(rawTarget) && Object.prototype.hasOwnProperty.call(arrayInstrumentations, key)) {
        return arrayInstrumentations[key].bind(receiver)
      }

      // Если мы находимся в реактивном контексте — подписываем текущий ключ
      if (engine.activeConsumer) {
        let sig = signalMap.get(key)
        if (!sig) {
          sig = engine.signal(0, `reactive:${name || 'object'}:${String(key)}`)
          signalMap.set(key, sig)
        }
        // Считываем значение сигнала для автоматической регистрации ребра графа
        sig.value
        if (key === 'length' && lenSignal) {
          lenSignal.value
        }
      }

      const res = Reflect.get(rawTarget, key, receiver)

      // Ленивое глубокое Proxy-проксирование на лету
      if (res !== null && typeof res === 'object') {
        return createReactive(engine, res, `${name || 'object'}.${String(key)}`)
      }
      return res
    },

    set(rawTarget, key, newValue, receiver) {
      const oldValue = Reflect.get(rawTarget, key, receiver)

      // Прерываем холостые мутации примитивов по Object.is
      if (Object.is(oldValue, newValue) && key !== 'length') {
        return true
      }

      const res = Reflect.set(rawTarget, key, newValue, receiver)
      if (res) {
        // Каскадно уведомляем граф через скрытый сигнальный маркер ключа
        let sig = signalMap.get(key)
        if (sig) {
          sig.value = (sig.value || 0) + 1
        }
        if (Array.isArray(rawTarget) && key !== 'length' && lenSignal) {
          // Принудительно триггерим длину, если изменился индекс массива
          lenSignal.value = rawTarget.length
        }
      }
      return res
    },

    deleteProperty(rawTarget, key) {
      const hasKey = Reflect.has(rawTarget, key)
      const res = Reflect.deleteProperty(rawTarget, key)
      if (res && hasKey) {
        let sig = signalMap.get(key)
        if (sig) {
          sig.value = (sig.value || 0) + 1
        }
        if (Array.isArray(rawTarget) && lenSignal) {
          lenSignal.value = rawTarget.length
        }
      }
      return res
    },

    ownKeys(rawTarget) {
      if (engine.activeConsumer) {
        let sig = signalMap.get('__ownKeys__')
        if (!sig) {
          sig = engine.signal(0, `reactive:${name || 'object'}:__ownKeys__`)
          signalMap.set('__ownKeys__', sig)
        }
        sig.value
      }
      return Reflect.ownKeys(rawTarget)
    }
  }

  const proxy = new Proxy(target, handler)
  engine.proxyCache.set(target, proxy)
  engine.proxyTargets.add(proxy)

  return proxy as T
}
