import { getExtractedValues } from '../utils/getExtractedValues'
import { EngineLoggerOptions, Resource, ResourceOptions, ResourceState, Signal } from './types'

// Контракт ядра движка для безопасных вызовов методов с дженериками
interface IReactiveEngine {
  signal<V>(initialValue: V, optionsOrName?: any): Signal<V>;
  effect(fn: () => any, name?: string): () => void;
  untrack<V>(fn: () => V): V;
  log(params: any): void;
  delay(ms: number, signal: AbortSignal): Promise<void>;
  logger: EngineLoggerOptions
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
  const baseDelay = 1000
  const useExponential = true
  const maxRetryDelay = 1000 * 60 * 5

  const retryCount = options.retryCount ?? 0
  const timeoutMs = options.timeout ?? 5000
  // Запоминаем точное время старта ВСЕЙ цепочки (включая ретраи и паузы)
  let startTime = Date.now()

  const state = engine.signal<ResourceState<T>>(
    {
      data: null,
      loading: true,
      error: null,
      isRetrying: false,
      attemptIndex: 0,
      retryCount,
      totalElapsedMs: undefined // Сбрасываем старый таймер
    },
    `[CORE_INTERNAL_SIGNAL=1]:resource:state:${resourceSignalName}`
  )

  const updateResourceState = (nextState: ResourceState<T>) => {
    engine.log({
      type: 'resource',
      label: resourceSignalName,
      details: { to: nextState, from: state.value },
    })
    state.value = nextState
  }

  const load = async (sValue: S, effectSignal: AbortSignal, isSourceChange = false) => {
    if (effectSignal.aborted) return

    // Фиксируем время старта бизнес-процесса в самом начале метода load
    startTime = Date.now()

    if (validateBeforeFetch) {
      const preValidationResult = validateBeforeFetch(sValue)
      if (preValidationResult === false || typeof preValidationResult === 'string') {
        if (effectSignal.aborted) return
        const errorMsg = typeof preValidationResult === 'string'
          ? preValidationResult
          : 'Pre-fetch validation failed for resource'

        const currentData = isSourceChange ? null : engine.untrack(() => state.value.data)
        // Явно зачищаем следы старого таймера при ошибке валидации аргументов
        updateResourceState({
          data: currentData,
          loading: false,
          error: errorMsg,
          isRetrying: false,
          attemptIndex: 0,
          retryCount,
          totalElapsedMs: undefined
        })
        return
      }
    }

    const shouldClear = isSourceChange && resetDataOnSourceChange
    const currentData = shouldClear ? null : engine.untrack(() => state.value.data)

    // Принудительно сбрасываем таймер в undefined перед входом в цикл ретраев
    updateResourceState({
      data: currentData,
      loading: true,
      error: null,
      isRetrying: false,
      attemptIndex: 0,
      retryCount,
      totalElapsedMs: undefined
    })

    // 🔄 Контур циклического выполнения попыток (от 0 до retryCount)
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (effectSignal.aborted) return

      // Создаем персональный сигнал таймаута на эту конкретную попытку
      const timeoutSignal = AbortSignal.timeout(timeoutMs)

      // Объединяем управляющий сигнал графа и наш таймаут
      const combinedSignal = AbortSignal.any([effectSignal, timeoutSignal])

      try {
        const data = await fetcher(sValue, combinedSignal)

        if (effectSignal.aborted) return

        // Если фетчер вернул управление, но таймаут успел отработать раньше
        if (timeoutSignal.aborted) {
          throw new DOMException('The operation timed out.', 'TimeoutError')
        }

        if (responseValidate) {
          const validationResult = responseValidate(data)
          if (validationResult === false || typeof validationResult === 'string') {
            if (effectSignal.aborted) return
            const errorMsg = typeof validationResult === 'string' ? validationResult : 'Validation failed'
            updateResourceState({
              data: null,
              loading: false,
              error: errorMsg,
              isRetrying: false,
              attemptIndex: 0,
              retryCount,
              totalElapsedMs: undefined
            })
            return
          }
        }

        if (effectSignal.aborted) return
        // Успех: сохраняем данные, полностью очищаем ошибки и сквозной таймер
        updateResourceState({
          data,
          loading: false,
          error: null,
          isRetrying: false,
          attemptIndex: 0,
          retryCount,
          totalElapsedMs: undefined
        })
        return

      } catch (e: unknown) {
        // 1. Выявляем, произошел ли сбой по таймауту
        const isTimeout = timeoutSignal.aborted ||
          (e as Error).name === 'TimeoutError' ||
          (e as Error).message?.includes('timeout')

        // Если это обычная отмена дебаунсом из внешнего контура, мгновенно прекращаем работу
        if (effectSignal.aborted && !isTimeout) return

        // 2. Безопасно извлекаем валидационные маркеры до их использования в условиях
        const isCustomValidationError = getExtractedValues({
          tested: [(e as Error).message], expectedKey: 'THROW_CUSTOM_VALIDATION_ERROR_NO_RETRY', valueType: 'number',
        })?.[0] === '1' || false

        const __defaultCustomValidationErrorMessage = 'Custom validation error'
        const customValidationErrorMessage: string = isCustomValidationError
          ? (getExtractedValues({
            tested: [(e as Error).message], expectedKey: 'MESSAGE', valueType: 'string',
          })?.[0] || __defaultCustomValidationErrorMessage)
          : __defaultCustomValidationErrorMessage

        const isFetchBodyValidationError = isCustomValidationError || (e as Error).name === 'ValidationError'

        // Если попытки исчерпаны ИЛИ это валидационная ошибка тела, которая не подлежит повтору
        if (attempt === retryCount || isFetchBodyValidationError) {
          if (effectSignal.aborted) return

          // Считаем суммарное время от первого клика/сдвига карты до текущего момента
          const totalElapsedMs = Date.now() - startTime

          // Переменная customValidationErrorMessage теперь гарантированно определена выше!
          const baseErrorMsg = isTimeout
            ? `Request timed out after ${timeoutMs}ms (attempt ${attempt + 1}/${retryCount + 1})`
            : isCustomValidationError
              ? customValidationErrorMessage
              : e instanceof Error ? e.message : String(e)

          // Формируем детальное сообщение для вывода в UI
          const finalErrorMessage = `${baseErrorMsg}.${engine.logger.isCoreOptimizationDebugEnabled ? ` Всего безуспешных попыток с момента изменения исходного сигнала: ${retryCount + 1}.` : ''}`

          updateResourceState({
            data: null,
            loading: false,
            error: finalErrorMessage,
            isRetrying: false,
            attemptIndex: attempt + 1, // Выводим финальное число сделанных попыток
            retryCount,
            totalElapsedMs,
          })
          return
        } else {
          // Инициализируем планирование следующей попытки (Retry Backoff Phase)
          if (effectSignal.aborted) return

          let currentDelay = useExponential ? baseDelay * Math.pow(2, attempt) : baseDelay
          currentDelay = Math.min(currentDelay, maxRetryDelay) + Math.random() * 200

          updateResourceState({
            data: state.value.data,
            loading: true,
            error: null,
            isRetrying: true,
            attemptIndex: attempt + 1, // Индекс следующей накатываемой попытки для UI (1, 2, 3...)
            retryCount
          })

          engine.log({
            type: 'resource',
            label: `${resourceSignalName}:retry_scheduled`,
            details: { payload: { attempt: attempt + 1, total: retryCount, nextDelayMs: Math.round(currentDelay) } }
          })

          const logReason = isTimeout ? 'таймауту' : 'ошибке сети'
          // Исправлен счетчик: пишем честный индекс текущего упавшего запроса из общего пула
          console.warn(`[Resource Retry] "${resourceSignalName}" сбой по ${logReason}. Запрос ${attempt + 1} из ${retryCount + 1} не удался. Ожидание повтора: ${Math.round(currentDelay)}ms`)

          try {
            // Спим перед следующим циклом, уважая отмену внешнего графа
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
