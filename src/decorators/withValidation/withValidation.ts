import { Signal } from '../../core/types'

export type ValidationSchema<T> = {
  [K in keyof T]?: (value: T[K], state: T) => string | true
}

export interface ValidationOptions<T> {
  schema: ValidationSchema<T>
  errorsSignal: Signal<Record<string, string>>
}

/**
 * Декоратор для синхронных экшенов (например, переключение шагов)
 */
export const withValidationSync = <T, Args extends any[], R>(
  targetAction: (...args: Args) => R,
  options: ValidationOptions<T>
) => {
  return (currentState: T, ...args: Args): R | void => {
    const { schema, errorsSignal } = options
    const nextErrors: Record<string, string> = {}
    let hasErrors = false

    for (const key in schema) {
      const validator = schema[key]
      if (typeof validator === 'function') {
        const result = validator(currentState[key], currentState)
        if (typeof result === 'string') {
          nextErrors[key] = result
          hasErrors = true
        }
      }
    }

    errorsSignal.value = nextErrors
    if (hasErrors) return

    return targetAction(...args)
  }
}

/**
 * Декоратор СТРОГО для асинхронных фетчеров engine.resource.
 * Прозрачно сохраняет типы входных и выходных данных оригинального fetcher.
 */
export const withValidationAsync = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ValidationOptions<S>
) => {
  return async (sourceValue: S, abortSignal: AbortSignal): Promise<T> => {
    const { schema, errorsSignal } = options
    const nextErrors: Record<string, string> = {}
    let hasErrors = false

    for (const key in schema) {
      const validator = schema[key]
      if (typeof validator === 'function') {
        const result = validator(sourceValue[key], sourceValue)
        if (typeof result === 'string') {
          nextErrors[key] = result
          hasErrors = true
        }
      }
    }

    errorsSignal.value = nextErrors

    if (hasErrors) {
      throw new Error('Core validation stopper')
    }

    return fetcher(sourceValue, abortSignal)
  }
}
