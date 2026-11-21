/**
 * Поверхностное сравнение объектов и массивов (1 уровень вложенности).
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false
    }
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  const recA = a as Record<string, unknown>
  const recB = b as Record<string, unknown>
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!Object.prototype.hasOwnProperty.call(recB, key) || !Object.is(recA[key], recB[key])) {
      return false
    }
  }
  return true
}

/**
 * Глубокое структурное сравнение значений с защитой от циклических ссылок.
 */
export function deepEqual<T>(a: T, b: T, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime())
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags
  }

  const objA = a as object
  const objB = b as object
  if (seen.get(objA) === objB) return true
  seen.set(objA, objB)

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false
    }
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  const recA = a as Record<string, unknown>
  const recB = b as Record<string, unknown>
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!Object.prototype.hasOwnProperty.call(recB, key) || !deepEqual(recA[key], recB[key], seen)) {
      return false
    }
  }
  return true
}
