import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Resources', () => {
    it('должен корректно отрабатывать жизненный цикл загрузки данных', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched_data')
      const source = engine.signal(1)

      const res = engine.resource(fetcher, source)

      // Изначальное состояние загрузки
      expect(res.loading).toBe(true)
      expect(res.data).toBeNull()

      // Ждем разрешения промиса во внутреннем тике
      await vi.waitFor(() => expect(res.loading).toBe(false))

      expect(res.data).toBe('fetched_data')
      expect(res.error).toBeNull()
    })

    it('должен прерывать предыдущий запрос при изменении source зависимостей', async () => {
      let resolveFirstRequest: any
      const firstPromise = new Promise((resolve) => { resolveFirstRequest = resolve })

      const fetcher = vi.fn()
        .mockImplementationOnce((_src, _signal) => firstPromise)
        .mockResolvedValueOnce('second_data')

      const source = engine.signal(1)
      const res = engine.resource(fetcher, source)

      // Меняем source до того, как первый промис зарезолвился
      source.value = 2

      await vi.waitFor(() => expect(res.loading).toBe(false))

      // Данные первого запроса должны быть проигнорированы, так как сработал AbortController
      expect(res.data).toBe('second_data')
    })
  })
})

describe('Resources - Retry & MaxRetryDelay Support', () => {
  let engine: ReactiveEngine

  let consoleWarnSpy: any // 1. Объявляем переменную на уровне describe

  beforeEach(() => {
    engine = new ReactiveEngine()
    vi.useFakeTimers()
    // 2. Инициализируем шпион ОДИН раз для ВСЕХ тестов в этом блоке
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
  })

  afterEach(() => {
    vi.useRealTimers()
    // 3. Восстанавливаем оригинальный console.warn после каждого теста
    consoleWarnSpy.mockRestore()
  })

  it('должен совершать повторные попытки при ошибках и выставлять флаг isRetrying', async () => {
    // Имитируем падение первых двух запросов и успех на третьем
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockResolvedValueOnce('success_after_retries')

    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'test-retry-resource',
      retryCount: 2,
      retryDelay: 1000,
      isExponentialBackoffEnabled: false // Фиксированная задержка для простоты теста
    })

    // --- Первая попытка (сразу падает) ---
    // Ждем завершения микротасок, чтобы движок зафиксировал первую ошибку и ушел в тайм-аут
    await vi.runAllTicks()
    expect(res.loading).toBe(true)
    expect(res.isRetrying).toBe(true) // Флаг должен подняться, так как мы зашли на круг ретраев
    expect(fetcher).toHaveBeenCalledTimes(1)

    // --- Перематываем время на 1 секунду вперед (запускается вторая попытка) ---
    // Используем Async-версию, так как внутри цепочки промисов есть асинхронный цикл
    await vi.advanceTimersByTimeAsync(1200) // 1000ms + запас под Jitter
    expect(res.isRetrying).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)

    // --- Перематываем время еще на 1 секунду вперед (запускается третья, успешная попытка) ---
    await vi.advanceTimersByTimeAsync(1200)
    expect(fetcher).toHaveBeenCalledTimes(3)

    // Проверяем финальное состояние после успеха
    expect(res.loading).toBe(false)
    expect(res.isRetrying).toBe(false) // Сбросился в false
    expect(res.data).toBe('success_after_retries')
    expect(res.error).toBeNull()

    // ДОБАВЛЯЕМ СТРОКУ СЮДА (в самый конец успешного теста):
    // Проверяем, что шпион consoleWarnSpy перехватил вызовы предупреждений от ядра
    // expect(consoleWarnSpy).toHaveBeenCalled();
  })

  it('должен прекратить попытки и записать ошибку, если лимит retryCount исчерпан', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Fatal connection loss'))
    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'test-failed-retry',
      retryCount: 2,
      retryDelay: 1000,
      isExponentialBackoffEnabled: false
    })

    // Проходим все круги ада (всего 3 запроса: 1 базовый + 2 ретрая)
    await vi.runAllTicks() // Упал 1-й запрос
    await vi.advanceTimersByTimeAsync(1200) // Упал 2-й запрос
    await vi.advanceTimersByTimeAsync(1200) // Упал 3-й запрос

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(res.loading).toBe(false)
    expect(res.isRetrying).toBe(false) // Движок сдался, флаг выключен
    expect(res.data).toBeNull()
    expect(res.error).toBeInstanceOf(Error)
    expect(res.error?.message).toBe('Fatal connection loss')
  })

  it('должен корректно применять экспоненциальную задержку и ограничивать её через maxRetryDelay', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Server 500'))
    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'test-exponential-max-limit',
      retryCount: 4,
      retryDelay: 1000, // 1000 -> 2000 -> 4000 -> 8000 -> ...
      isExponentialBackoffEnabled: true,
      maxRetryDelay: 3000 // Жестко ограничиваем рост на 3 секундах!
    })

    await vi.runAllTicks() // Упала попытка 0 (сразу)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Шаг 1: Ожидание перед попыткой 1. Формула: 1000 * 2^0 = 1000ms (+ jitter)
    await vi.advanceTimersByTimeAsync(1200)
    expect(fetcher).toHaveBeenCalledTimes(2)

    // Шаг 2: Ожидание перед попыткой 2. Формула: 1000 * 2^1 = 2000ms (+ jitter)
    await vi.advanceTimersByTimeAsync(2200)
    expect(fetcher).toHaveBeenCalledTimes(3)

    // Шаг 3: Ожидание перед попыткой 3.
    // Без лимита было бы: 1000 * 2^2 = 4000ms.
    // Но сработает Math.min(4000, maxRetryDelay), поэтому ждем ровно 3000ms (+ jitter)
    await vi.advanceTimersByTimeAsync(3200)
    expect(fetcher).toHaveBeenCalledTimes(4)

    // Шаг 4: Ожидание перед попыткой 4. Снова ограничивается лимитом в 3000ms (+ jitter)
    await vi.advanceTimersByTimeAsync(3200)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('должен мгновенно прекращать цикл повторов, если во время паузы произошла отмена запроса', async () => {
    vi.useRealTimers()
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

    const fetcher = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'))
    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'test-abort-retry',
      retryCount: 3,
      retryDelay: 1000,
      isExponentialBackoffEnabled: false
    })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(res.isRetrying).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 5))

    // ОДИН ОФИЦИАЛЬНЫЙ СБРОС СЕССИИ
    res.refetch()

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    await new Promise((resolve) => setTimeout(resolve, 50))

    // Вызовов останется строго 2! Токенизация и защита от TypeError закроют заслонку.
    expect(fetcher).toHaveBeenCalledTimes(2)

    consoleSpy.mockRestore()
  })

})

describe('Resources - Signal Subscription & Race Condition Protection', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  it('должен подписываться на изменения и корректно отменять старый запрос при смене source', async () => {
    // Использовать реальное время для честной проверки очередности асинхронных потоков
    vi.useRealTimers()
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

    let resolveFirstRequest: any
    let resolveSecondRequest: any

    // Создаем два управляемых промиса для симуляции задержки бэкенда
    const firstPromise = new Promise((resolve) => { resolveFirstRequest = resolve })
    const secondPromise = new Promise((resolve) => { resolveSecondRequest = resolve })

    // Настраиваем fetcher так, чтобы первый вызов завис на firstPromise, а второй — на secondPromise
    const fetcher = vi.fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => secondPromise)

    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'race-condition-test-resource',
      resetDataOnSourceChange: true, // Включаем автоматический сброс
      retryCount: 0 // Выключаем ретраи для чистоты этого теста
    })

    // Храним историю изменений, которые прилетят через подписку
    const stateHistory: any[] = []

    // 1. ПОДПИСКА: Оформляем подписку на состояние ресурса, как это делает хук useReactiveValue
    const unsubscribe = res.subscribe((currentState) => {
      stateHistory.push({ ...currentState })
    })

    // Даем выполниться синхронному старту первого запроса (для source = 1)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(res.loading).toBe(true)
    expect(res.data).toBeNull()

    // 2. СМЕНА СИГНАЛА: Быстро переключаем источник на 2, пока первый запрос еще ПЕНДИТСЯ
    source.value = 2

    // Даем выполниться старту второго запроса (для source = 2)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    // На этот момент первый AbortController внутри ядра уже обязан вызвать .abort()
    // 3. СИМУЛЯЦИЯ ОШИБКИ ИЗ-ЗА RACE CONDITION:
    // Симулируем, что бэкенд по первому («отмененному») запросу ответил РАНЬШЕ, чем по второму
    resolveFirstRequest('old_stale_data_from_user_1')

    // Даем микротаскам провернуться, чтобы проверить, прорвется ли старый ответ в стейт
    await new Promise((resolve) => setTimeout(resolve, 20))

    // ПРОВЕРКА ЗАЩИТЫ: Старые данные ДОЛЖНЫ быть проигнорированы ядром!
    // В стейте по-прежнему должен быть null, так как поток для source=1 споткнулся о guard-проверку отмены
    expect(res.data).toBeNull()
    expect(res.loading).toBe(true)

    // 4. ЗАВЕРШЕНИЕ АКТУАЛЬНОГО ЗАПРОСА: Разрешаем второй запрос (актуальный для source = 2)
    resolveSecondRequest('fresh_actual_data_from_user_2')

    // Ждем, пока стейт обновится актуальными данными
    await vi.waitFor(() => expect(res.loading).toBe(false))

    // Финальные проверки состояния данных
    expect(res.data).toBe('fresh_actual_data_from_user_2')
    expect(res.error).toBeNull()

    // Проверяем, что в истории подписок зафиксировано корректное изменение стейта
    expect(stateHistory.length).toBeGreaterThan(0)

    // Самый последний кадр истории обязан содержать только актуальные данные
    const lastState = stateHistory[stateHistory.length - 1]
    expect(lastState.data).toBe('fresh_actual_data_from_user_2')

    // Обязательно чистим за собой подписку и шпионов
    unsubscribe()
    consoleSpy.mockRestore()
  })
})

describe('Resources - Multi-Signal Subscription & Race Condition Protection', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  it('должен подписываться на два сигнала и отменять старый запрос при изменении любого из них', async () => {
    // Используем реальное время для честной проверки очередности асинхронных потоков
    vi.useRealTimers()
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

    let resolveFirstRequest: any
    let resolveSecondRequest: any
    let resolveThirdRequest: any

    const firstPromise = new Promise((resolve) => { resolveFirstRequest = resolve })
    const secondPromise = new Promise((resolve) => { resolveSecondRequest = resolve })
    const thirdPromise = new Promise((resolve) => { resolveThirdRequest = resolve })

    // Настраиваем fetcher для последовательных асинхронных ответов
    const fetcher = vi.fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => secondPromise)
      .mockImplementationOnce(() => thirdPromise)

    // 1. ИНИЦИАЛИЗАЦИЯ ДВУХ СИГНАЛОВ
    const isUserDataReceived = engine.signal(false)
    const activePersonId = engine.signal('person-1')

    // Создаем составную зависимость (как apiDeps в SecondaryService)
    const apiDeps = engine.computed<[boolean, string]>(() => [
      isUserDataReceived.value,
      activePersonId.value,
    ])

    // Создаем ресурс, который зависит от нашего составного computed
    const res = engine.resource(fetcher, apiDeps, {
      name: 'multi-signal-race-condition-resource',
      resetDataOnSourceChange: true,
      retryCount: 0
    })

    const stateHistory: any[] = []
    const unsubscribe = res.subscribe((currentState) => {
      stateHistory.push({ ...currentState })
    })

    // Даем выполниться синхронному старту первого запроса (Вызов 1)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(res.loading).toBe(true)

    // 2. СМЕНА ПЕРВОГО СИГНАЛА: Меняем статус загрузки пользователя
    isUserDataReceived.value = true

    // Предыдущий запрос должен быть отменен, стартует второй запрос (Вызов 2)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))

    // 3. СМЕНА ВТОРОГО СИГНАЛА: Быстро переключаем ID пользователя
    activePersonId.value = 'person-2'

    // Второй запрос должен быть отменен, стартует третий запрос (Вызов 3)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))

    // 4. СИМУЛЯЦИЯ RACE CONDITION:
    // Симулируем, что бэкенд по первому И второму ("отмененным") запросам ответил РАНЬШЕ, чем по третьему
    resolveFirstRequest('stale_data_1')
    resolveSecondRequest('stale_data_2')

    // Даем микротаскам провернуться
    await new Promise((resolve) => setTimeout(resolve, 20))

    // ПРОВЕРКА ЗАЩИТЫ: Старые ответы полностью проигнорированы, стейт чист
    expect(res.data).toBeNull()
    expect(res.loading).toBe(true)

    // 5. ЗАВЕРШЕНИЕ АКТУАЛЬНОГО ЗАПРОСА: Разрешаем третий запрос (для актуальной комбинации сигналов)
    resolveThirdRequest('fresh_actual_multi_signal_data')

    // Ждем обновления стейта актуальными данными
    await vi.waitFor(() => expect(res.loading).toBe(false))

    // Финальные проверки
    expect(res.data).toBe('fresh_actual_multi_signal_data')
    expect(res.error).toBeNull()

    // Проверяем, что в истории подписок самый последний кадр содержит корректные данные
    expect(stateHistory.length).toBeGreaterThan(0)
    const lastState = stateHistory[stateHistory.length - 1]
    expect(lastState.data).toBe('fresh_actual_multi_signal_data')

    // Чистим за собой
    unsubscribe()
    consoleSpy.mockRestore()
  })
})

describe('Resources - Timeout Support', () => {
  let consoleWarnSpy: any
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
    vi.useRealTimers() // Используем реальное время Node.js
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('должен принудительно прерывать зависший запрос по таймауту и запускать ретраи // Этот тест показывает, что асинхронный ресурс принудительно прерывает зависший сетевой запрос ровно через указанное в таймауте время и успешно запускает детерминированную цепочку повторных попыток с корректным обновлением реактивных флагов состояния.', async () => {
    const fetcher = vi.fn().mockImplementation((_src, signal: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))

        signal.addEventListener('abort', () => {
          reject(new DOMException('The operation timed out.', 'TimeoutError'))
        }, { once: true })
      })
    })

    const source = engine.signal(1)

    const res = engine.resource(fetcher, source, {
      name: 'test-timeout-resource',
      timeout: 10,   // Микро-таймаут 10мс
      retryCount: 2, // 2 ретрая (всего 3 запроса)
      retryDelay: 10, // Базовая пауза 10мс (к ней прибавится случайный jitter до 200мс)
      isExponentialBackoffEnabled: false
    })

    // --- Старт Попытки 0 ---
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(res.loading).toBe(true)
    expect(res.isRetrying).toBe(false)

    // 1. Ждем падения первого запроса по таймауту.
    // Как только он упадет, взведется флаг isRetrying
    await vi.waitFor(() => {
      expect(res.isRetrying).toBe(true)
    }, { timeout: 100, interval: 5 }) // Даем до 100мс на срабатывание таймаута

    expect(fetcher).toHaveBeenCalledTimes(1) // Мы зашли в паузу сна, 2-й запрос еще не ушел

    // 2. Ждем, пока сработает Попытка 1.
    // Из-за Jitter это займет от 10 до 210мс. vi.waitFor будет терпеливо проверять счетчик.
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2)
    }, { timeout: 300, interval: 10 })

    expect(res.isRetrying).toBe(true) // Второй запрос тоже пендится в таймауте

    // 3. Ждем, пока сработает финальная Попытка 2.
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(3)
    }, { timeout: 300, interval: 10 })

    // 4. Ждем, когда финальный запрос упадет по таймауту и движок полностью сдастся
    await vi.waitFor(() => {
      expect(res.loading).toBe(false)
    }, { timeout: 200, interval: 10 })

    // Финальные проверки стейта после полного завершения цикла
    expect(res.isRetrying).toBe(false)
    expect(res.data).toBeNull()
    expect(res.error).toBeInstanceOf(Error)
    expect(res.error?.message).toContain('Request timed out after 10ms')
  })
})
