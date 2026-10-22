import { getExtractedValues } from '../utils/getExtractedValues'
import { Resource, ResourceOptions, ResourceState, Signal } from './types'

// Контракт ядра движка для безопасных вызовов методов с дженериками
interface IReactiveEngine {
  signal<V>(initialValue: V, optionsOrName?: any): Signal<V>;
  effect(fn: () => any, name?: string): () => void;
  untrack<V>(fn: () => V): V;
  log(params: any): void;
  delay(ms: number, signal: AbortSignal): Promise<void>;
}

export function createResource<T, S = void>(
  engine: IReactiveEngine,
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  source?: { value: S },
  optionsOrName?: string | ResourceOptions<T, S>
): Resource<T> {
  const isOptionsObject = optionsOrName && typeof optionsOrName === 'object'
  const resourceSignalName = isOptionsObject
    ? ((optionsOrName as ResourceOptions<T, S>).name || 'unnamed_resource')
    : (optionsOrName as string) || 'unnamed_resource'

  const options: Partial<ResourceOptions<T, S>> = isOptionsObject
    ? (optionsOrName as ResourceOptions<T, S>)
    : {}

  const resetDataOnSourceChange = options.resetDataOnSourceChange ?? true
  const responseValidate = options.responseValidate
  const validateBeforeFetch = options.validateBeforeFetch
  const retryCount = 0
  const baseDelay = 1000
  const useExponential = true
  const maxRetryDelay = 1000 * 60 * 5
  const timeoutMs = 1000

  // Вызов скомпилируется успешно, так как метод signal теперь строго описан в интерфейсе
  const state = engine.signal<ResourceState<T>>(
    { data: null, loading: true, error: null, isRetrying: false },
    `[CORE_INTERNAL_SIGNAL=1]:resource:state:${resourceSignalName}`
  )

  const updateResourceState = (nextState: ResourceState<T>) => {
    engine.log({ type: 'resource', label: resourceSignalName, details: { to: nextState, from: state.value } })
    state.value = nextState
  }

  const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
    if (effectSignal.aborted) return
    const isValid = options.validateBeforeFetch ? options.validateBeforeFetch(sValue) : true

    if (validateBeforeFetch) {
      const preValidationResult = validateBeforeFetch(sValue)
      if (preValidationResult === false || typeof preValidationResult === 'string') {
        if (effectSignal.aborted) return
        const errorMsg = typeof preValidationResult === 'string'
          ? preValidationResult
          : 'Pre-fetch validation failed for resource'

        const currentData = isSourceChange ? null : engine.untrack(() => state.value.data)
        updateResourceState({ data: currentData, loading: false, error: errorMsg, isRetrying: false })
        return
      }
    }
    const shouldClear = isSourceChange && resetDataOnSourceChange
    const currentData = shouldClear ? null : engine.untrack(() => state.value.data)
    updateResourceState({ data: currentData, loading: true, error: null, isRetrying: false })
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (effectSignal.aborted) return
      let combinedSignal = effectSignal
      try {
        const data = await fetcher(sValue, combinedSignal)
        if (effectSignal.aborted) return
        if (combinedSignal.aborted) {
          throw new DOMException('The operation timed out.', 'TimeoutError')
        }
        if (responseValidate) {
          const validationResult = responseValidate(data)
          if (validationResult === false || typeof validationResult === 'string') {
            if (effectSignal.aborted) return
            const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
            updateResourceState({ data: null, loading: false, error: errorMsg, isRetrying: false })
            return
          }
        }
        if (effectSignal.aborted) return
        updateResourceState({ data, loading: false, error: null, isRetrying: false })
        return
      } catch (e: unknown) {
        if (effectSignal.aborted || ((e as Error).name === 'AbortError' && effectSignal.aborted)) return
        const isTimeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError' || (e as Error).message?.includes('timeout')
        const isCustomValidationError = getExtractedValues({
          tested: [(e as Error).message], expectedKey: 'THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY', valueType: 'number',
        })?.[0] === '1' || false
        const __defaultCustomValidationErrorMessage = 'Custom validation error'
        let customValidationErrorMessage: string = isCustomValidationError
          ? (getExtractedValues({
            tested: [(e as Error).message], expectedKey: 'MESSAGE', valueType: 'string',
          })?.[0] || __defaultCustomValidationErrorMessage)
          : __defaultCustomValidationErrorMessage
        const isFetchBodyValidationError = isCustomValidationError || (e as Error).name === 'ValidationError'
        if (attempt === retryCount || isFetchBodyValidationError) {
          if (effectSignal.aborted) return
          const finalError = isTimeout
            ? new Error(`Request timed out after ${timeoutMs}ms`, { cause: e })
            : isCustomValidationError
              ? new Error(customValidationErrorMessage, { cause: e })
              : e

          updateResourceState({
            data: null, loading: false,
            error: finalError instanceof Error ? finalError.message : typeof finalError === 'string' ? finalError : `typeof finalError is ${typeof finalError}`,
            isRetrying: false,
          })
          return
        } else {
          if (effectSignal.aborted) return
          let currentDelay = useExponential ? baseDelay * Math.pow(2, attempt) : baseDelay
          currentDelay = Math.min(currentDelay, maxRetryDelay)
          const jitter = Math.random() * 200
          currentDelay = currentDelay + jitter
          updateResourceState({ data: state.value.data, loading: true, error: null, isRetrying: true })
          const logReason = isTimeout ? 'таймауту' : 'ошибке сети'
          console.warn(`[Resource Retry] "${resourceSignalName}" сбой по ${logReason}. Попытка ${attempt + 1}/${retryCount > 0 ? retryCount + 1 : attempt + 1}...`)

          try {
            await engine.delay(currentDelay, effectSignal)
            if (effectSignal.aborted) return
          } catch (delayError) {
            return
          }
        }
      }
    }
  }

  let activeEffectController: AbortController | null = null

  const disposeInternalEffect = engine.effect(() => {
    const sValue = source ? source.value : undefined as S
    const effectController = new AbortController()
    activeEffectController = effectController

    engine.untrack(() => {
      load(sValue as S, effectController.signal, true)
    })

    return () => effectController.abort()
  }, '[CORE_INTERNAL_SIGNAL=1]:effect')

  return {
    get data() { return state.value.data },
    get loading() { return state.value.loading },
    get error() { return state.value.error },
    get isRetrying() { return state.value.isRetrying },
    get value() { return state.value },
    refetch: () => {
      activeEffectController?.abort()
      activeEffectController = new AbortController()
      load(source ? source.value : undefined as S, activeEffectController.signal, false)
    },
    subscribe: (cb: (val: ResourceState<T>) => void) => state.subscribe(cb),
    destroy: () => {
      activeEffectController?.abort()
      activeEffectController = null
      if (typeof disposeInternalEffect === 'function') {
        disposeInternalEffect()
      }
      if ((state as any).destroy) {
        (state as any).destroy()
      }
    }
  } as any
}
