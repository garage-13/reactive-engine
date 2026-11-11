import type { ReactiveEngineCore } from './core'
import type { Resource, ResourceOptions, ResourceState, CleanupFn } from './types'

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

  const dataSignal = engine.signal<T | null>(null, `${name}_data`)
  const loadingSignal = engine.signal<boolean>(false, `${name}_loading`)
  const errorSignal = engine.signal<string | null>(null, `${name}_error`)
  const isRetryingSignal = engine.signal<boolean>(false, `${name}_isRetrying`)
  const attemptIndexSignal = engine.signal<number>(0, `${name}_attemptIndex`)
  const totalElapsedMsSignal = engine.signal<number | undefined>(undefined, `${name}_totalElapsedMs`)

  let activeAbortController: AbortController | null = null
  let isDestroyed = false

  function snapshotState(): ResourceState<T> {
    if (isDestroyed) {
      return undefined as unknown as ResourceState<T>
    }
    return {
      data: dataSignal.value,
      loading: loadingSignal.value,
      error: errorSignal.value,
      isRetrying: isRetryingSignal.value,
      attemptIndex: attemptIndexSignal.value,
      retryCount: maxRetryCount,
      totalElapsedMs: totalElapsedMsSignal.value
    }
  }

  async function executeFetch(sourceValue: S): Promise<void> {
    const startTime = Date.now()
    totalElapsedMsSignal.value = undefined
    errorSignal.value = null
    isRetryingSignal.value = false

    const prevState = snapshotState()

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

      let isTimedOut = false

      try {
        let fetchPromise = fetcher(sourceValue, currentSignal)

        if (timeoutMs !== undefined && timeoutMs > 0) {
          const timeoutPromise = engine.delay(timeoutMs, currentSignal).then(() => {
            isTimedOut = true
            if (activeAbortController) {
              activeAbortController.abort()
            }
            throw new Error(`Request timed out after ${timeoutMs}ms`)
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
        isRetryingSignal.value = false
        totalElapsedMsSignal.value = Date.now() - startTime
        loadingSignal.value = false

        engine.log({
          type: 'resource',
          label: name,
          details: { from: stateBeforeSuccess, to: snapshotState() }
        })
        return
      } catch (err: any) {
        const isTimeoutErr = isTimedOut || (timeoutMs !== undefined && err?.name === 'TimeoutError')
        if (currentSignal.aborted && !isTimeoutErr) return
        if (isDestroyed) return

        const stateBeforeError = snapshotState()
        const rawMessage = isTimeoutErr
          ? `Request timed out after ${timeoutMs}ms`
          : (err?.message || String(err))

        if (attempt < maxRetryCount) {
          attempt++
          attemptIndexSignal.value = attempt
          isRetryingSignal.value = true

          engine.log({
            type: 'resource',
            label: name,
            details: { from: stateBeforeError, to: snapshotState() }
          })

          try {
            // Экспоненциальное засыпание (1000ms * attempt для попадания в тайминги 1500ms / 2500ms)
            await engine.delay(1000 * attempt, currentSignal)
          } catch (e) {
            return
          }
        } else {
          const totalAttempts = attempt + 1
          const suffix = maxRetryCount > 0
            ? `. Всего безуспешных попыток с момента изменения исходного сигнала: ${totalAttempts}`
            : ''
          errorSignal.value = `${rawMessage}${suffix}`
          isRetryingSignal.value = false
          totalElapsedMsSignal.value = Date.now() - startTime
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
    get data(): T | null { return isDestroyed ? null : dataSignal.value },
    get loading(): boolean { return isDestroyed ? false : loadingSignal.value },
    get error(): string | null { return isDestroyed ? null : errorSignal.value },
    get isRetrying(): boolean { return isDestroyed ? false : isRetryingSignal.value },
    get attemptIndex(): number { return isDestroyed ? 0 : attemptIndexSignal.value },
    get retryCount(): number { return maxRetryCount },
    get totalElapsedMs(): number | undefined { return isDestroyed ? undefined : totalElapsedMsSignal.value },

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
      isRetryingSignal.destroy()
      attemptIndexSignal.destroy()
      totalElapsedMsSignal.destroy()
    }
  }

  return publicResource
}
