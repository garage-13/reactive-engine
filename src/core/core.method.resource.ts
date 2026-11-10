import type { ReactiveEngineCore } from './core'
import type { Resource, ResourceOptions, ResourceState, CleanupFn } from './types'

/**
 * Фабрика умных реактивных декларативных ресурсов с автоматическим
 * подавлением Race Conditions, встроенным методом .destroy() и транзакционным логированием.
 */
export function createResource<T, S = void>(
  engine: ReactiveEngineCore,
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  source?: { value: S },
  optionsOrName?: string | ResourceOptions<T, S>
): Resource<T> {
  const name = typeof optionsOrName === 'string' ? optionsOrName : (optionsOrName?.name || 'resource')
  const options = typeof optionsOrName === 'object' ? optionsOrName : {}

  const resetDataOnSourceChange = options.resetDataOnSourceChange ?? false
  const timeoutMs = options.timeout
  const maxRetryCount = options.retryCount ?? 0
  const validateBeforeFetch = options.validateBeforeFetch
  const responseValidate = options.responseValidate

  // Инициализируем реактивное состояние ресурса через атомарные сигналы
  const dataSignal = engine.signal<T | null>(null, `${name}_data`)
  const loadingSignal = engine.signal<boolean>(false, `${name}_loading`)
  const errorSignal = engine.signal<string | null>(null, `${name}_error`)
  const attemptIndexSignal = engine.signal<number>(0, `${name}_attemptIndex`)

  let activeAbortController: AbortController | null = null
  let isDestroyed = false

  // Хелпер для фиксации текущего слепка состояния для логгера
  function snapshotState(): ResourceState<T> {
    return {
      data: dataSignal.value,
      loading: loadingSignal.value,
      error: errorSignal.value,
      attemptIndex: attemptIndexSignal.value,
      retryCount: maxRetryCount
    }
  }

  async function executeFetch(sourceValue: S): Promise<void> {
    const prevState = snapshotState()

    // 1. Валидация источника перед фетчем
    if (validateBeforeFetch) {
      const validationResult = validateBeforeFetch(sourceValue)
      if (validationResult === false || typeof validationResult === 'string') {
        const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
        errorSignal.value = errorMsg
        loadingSignal.value = false

        engine.log({
          type: 'resource',
          label: name,
          details: { from: prevState, to: snapshotState() }
        })
        return
      }
    }

    let attempt = 0
    attemptIndexSignal.value = attempt

    while (attempt <= maxRetryCount && !isDestroyed) {
      if (activeAbortController) {
        activeAbortController.abort()
      }

      activeAbortController = new AbortController()
      const currentSignal = activeAbortController.signal

      const stateBeforeFetch = snapshotState()
      loadingSignal.value = true
      if (attempt === 0 && resetDataOnSourceChange) {
        dataSignal.value = null
      }

      engine.log({
        type: 'resource',
        label: name,
        details: { from: stateBeforeFetch, to: snapshotState() }
      })

      try {
        let fetchPromise = fetcher(sourceValue, currentSignal)

        if (timeoutMs !== undefined && timeoutMs > 0) {
          const timeoutPromise = engine.delay(timeoutMs, currentSignal).then(() => {
            throw new DOMException('Timeout exceeded', 'TimeoutError')
          })
          fetchPromise = Promise.race([fetchPromise, timeoutPromise])
        }

        const payload = await fetchPromise

        if (currentSignal.aborted || isDestroyed) return

        if (responseValidate) {
          const resValidation = responseValidate(payload)
          if (resValidation === false || typeof resValidation === 'string') {
            throw new Error(typeof resValidation === 'string' ? resValidation : 'Response validation failed')
          }
        }

        const stateBeforeSuccess = snapshotState()
        dataSignal.value = payload
        errorSignal.value = null
        loadingSignal.value = false

        engine.log({
          type: 'resource',
          label: name,
          details: { from: stateBeforeSuccess, to: snapshotState() }
        })
        return

      } catch (err: any) {
        if (currentSignal.aborted || isDestroyed) return

        const stateBeforeError = snapshotState()

        if (attempt < maxRetryCount) {
          attempt++
          attemptIndexSignal.value = attempt

          engine.log({
            type: 'resource',
            label: name,
            details: { from: stateBeforeError, to: snapshotState() }
          })

          try {
            await engine.delay(100 * attempt, currentSignal)
          } catch (e) {
            return
          }
        } else {
          errorSignal.value = err?.message || String(err)
          loadingSignal.value = false

          engine.log({
            type: 'resource',
            label: name,
            details: { from: stateBeforeError, to: snapshotState() }
          })
          return
        }
      }
    }
  }

  const unsubscribeEffect = engine.effect(() => {
    if (source) {
      const currentSourceValue = source.value
      engine.untrack(() => {
        executeFetch(currentSourceValue)
      })
    } else {
      engine.untrack(() => {
        executeFetch(undefined as unknown as S)
      })
    }
  }, `${name}_effect`)

  const publicResource: Resource<T> = {
    get data(): T | null { return dataSignal.value },
    get loading(): boolean { return loadingSignal.value },
    get error(): string | null { return errorSignal.value },
    get attemptIndex(): number { return attemptIndexSignal.value },
    get retryCount(): number { return maxRetryCount },

    refetch(): void {
      if (isDestroyed) return
      engine.untrack(() => {
        if (source) {
          executeFetch(source.value)
        } else {
          executeFetch(undefined as unknown as S)
        }
      })
    },

    subscribe(cb: (val: ResourceState<T>) => void): CleanupFn {
      return engine.effect(() => {
        cb(publicResource.value)
      })
    },

    get value(): ResourceState<T> {
      return snapshotState()
    },

    destroy(): void {
      isDestroyed = true
      if (activeAbortController) {
        activeAbortController.abort()
        activeAbortController = null
      }
      unsubscribeEffect()
      dataSignal.destroy()
      loadingSignal.destroy()
      errorSignal.destroy()
      attemptIndexSignal.destroy()
    }
  }

  return publicResource
}
