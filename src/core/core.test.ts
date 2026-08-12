import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from './core' // Путь к вашему файлу ядра

interface EngineWithPrivate {
  allEffects: Set<unknown>;
  computedCache: Map<unknown, unknown>;
}

// 1. ВЫНОСИМ В ИЗОЛИРОВАННУЮ ФУНКЦИЮ НАВЕРХ
// Это гарантирует, что при выходе из этой функции стек Node.js полностью очистится
function createTemporaryComputed(engine: ReactiveEngine, countSignal: any) {
  // Просто создаем computed и считываем значение, чтобы активировать эффект
  const isEven = engine.computed(() => countSignal.value % 2 === 0)
  return isEven.value
}

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  // ==========================================
  // 1. ТЕСТЫ DEPENDENCY INJECTION (DI)
  // ==========================================
  describe('Dependency Injection (provide / inject)', () => {
    it('должен корректно регистрировать и возвращать простые значения/сервисы', () => {
      const token = 'CONFIG_TOKEN'
      engine.provide(token, { apiUrl: 'localhost' })

      const config = engine.inject<{ apiUrl: string }>(token)
      expect(config.apiUrl).toBe('localhost')
    })

    it('должен лениво создавать инстанс через фабрику при первом вызове inject', () => {
      const token = 'FACTORY_TOKEN'
      const factorySpy = vi.fn(() => ({ foo: 'bar' }))

      // Создаем чистую функцию-фабрику
      const myFactory = (eng: ReactiveEngine) => factorySpy()

      // Принудительно удаляем у нее свойство prototype, чтобы обойти жесткую проверку в ядре
      Object.defineProperty(myFactory, 'prototype', { value: undefined })

      // Регистрируем фабрику в DI-контейнере
      engine.provide(token, myFactory)

      // Проверяем, что до вызова inject фабрика не вызывалась
      expect(factorySpy).not.toHaveBeenCalled()

      // Первый вызов — должен запустить фабрику и вернуть инстанс
      const instance1 = engine.inject(token)
      expect(factorySpy).toHaveBeenCalledTimes(1)
      expect(instance1).toEqual({ foo: 'bar' })

      // Повторный вызов — должен вернуть закешированный инстанс без повторного вызова фабрики
      const instance2 = engine.inject(token)
      expect(factorySpy).toHaveBeenCalledTimes(1)
      expect(instance1).toBe(instance2)
    })

    it('должен автоматически создавать класс-сервис, если токен является конструктором', () => {
      class TestService {
        constructor(public eng: ReactiveEngine) { }
      }

      const instance = engine.inject(TestService)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.eng).toBe(engine)
    })

    it('должен выбрасывать ошибку, если токен не найден или пустой', () => {
      // Проверяем ошибку для пустого токена
      expect(() => engine.inject(undefined as any)).toThrow(
        '[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.'
      )
      // Проверяем ошибку для неизвестного токена
      expect(() => engine.inject('UNKNOWN_TOKEN')).toThrow(
        '[DI Error]: Не удалось создать сервис UNKNOWN_TOKEN. Ошибка: Service not found: UNKNOWN_TOKEN'
      )
    })
  })

  // ==========================================
  // 2. ТЕСТЫ SIGNALS & EFFECTS
  // ==========================================
  describe('Signals & Effects', () => {
    it('должен сохранять начальное значение и обновлять его при записи', () => {
      const sig = engine.signal(10)
      expect(sig.value).toBe(10)

      sig.value = 20
      expect(sig.value).toBe(20)
    })

    it('должен автоматически запускать эффект при изменении сигнала', async () => {
      const sig = engine.signal('initial')
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('initial')

      sig.value = 'updated'

      // Ждем выполнения отложенного микрозадачей эффекта
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy).toHaveBeenCalledWith('updated')
    })

    it('не должен триггерить эффект, если устанавливается идентичное значение', () => {
      const sig = engine.signal(42)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      spy.mockClear()
      sig.value = 42 // Значение не изменилось
      expect(spy).not.toHaveBeenCalled()
    })

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта', async () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()

      const unsubscribe = engine.effect(() => {
        const val = sig.value
        return () => cleanupSpy(val)
      })

      expect(cleanupSpy).not.toHaveBeenCalled()

      sig.value = 2 // Перезапуск эффекта отложен

      // Ждем выполнения микрозадачи
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)

      unsubscribe() // Ручная отписка происходит синхронно
      expect(cleanupSpy).toHaveBeenCalledTimes(2)
      expect(cleanupSpy).toHaveBeenCalledWith(2)
    })


    it('должен поддерживать валидацию значений сигнала', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const sig = engine.signal(10, {
        validate: (val) => val > 0 || 'Число должно быть больше 0',
      })

      sig.value = -5 // Невалидное значение
      expect(sig.value).toBe(10) // Значение не изменилось
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ==========================================
  // 3. ТЕСТЫ COMPUTED PROPERTIES
  // ==========================================
  describe('Computed Properties', () => {
    it('должен вычислять значение на основе зависимых сигналов', async () => {
      const firstName = engine.signal('John')
      const lastName = engine.signal('Doe')
      const fullName = engine.computed(() => `${firstName.value} ${lastName.value}`)

      expect(fullName.value).toBe('John Doe')

      firstName.value = 'Jane'

      // Вычисление computed завязано на эффект, который теперь асинхронный
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(fullName.value).toBe('Jane Doe')
    })

    it('должен позволять подписываться на изменение вычисляемого значения', async () => {
      const count = engine.signal(1)
      const isEven = engine.computed(() => count.value % 2 === 0)
      const spy = vi.fn()

      isEven.subscribe(spy)

      count.value = 2

      // Ждем цепочку микрозадач сигналов и computed
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith(true)
      })
    })

    it('должен удалять внутренний эффект из памяти ядра при вызове метода destroy', async () => {
      const count = engine.signal(1)
      const getAllEffectsSize = () => (engine as any).allEffects.size
      const initialSize = getAllEffectsSize()

      const isEven = engine.computed(() => count.value % 2 === 0)
      expect(getAllEffectsSize()).toBe(initialSize + 1)

      count.value = 2

      // Даем отработать обновлению до того, как уничтожим
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      expect(isEven.value).toBe(true)

      isEven.destroy()
      expect(getAllEffectsSize()).toBe(initialSize)
    })
  })

  // ==========================================
  // 4. ТЕСТЫ BATCHING (ПАКЕТНЫЕ ОБНОВЛЕНИЯ)
  // ==========================================
  describe('Batching', () => {
    it('должен откладывать запуск эффектов до завершения батча (микрозадачи)', async () => {
      const sig1 = engine.signal(1)
      const sig2 = engine.signal(10)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig1.value, sig2.value)
      })

      spy.mockClear()

      engine.batch(() => {
        sig1.value = 2
        sig2.value = 20
        // Внутри батча эффект не должен сработать немедленно
        expect(spy).not.toHaveBeenCalled()
      })

      // Ждем выполнения очереди микрозадач (queueMicrotask)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

      // Эффект сработал ровно 1 раз для финальных значений вместо 2 раз
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(2, 20)
    })

    it('должен объединять несколько синхронных обновлений в один ререндер (Автобатчинг)', async () => {
      const sig1 = engine.signal(0)
      const sig2 = engine.signal(0)
      const effectSpy = vi.fn()

      // Создаем эффект, зависящий от обоих сигналов
      engine.effect(() => {
        effectSpy(sig1.value, sig2.value)
      })

      // Очищаем первоначальный вызов при монтировании эффекта
      effectSpy.mockClear()

      // Имитируем два синхронных изменения подряд БЕЗ использования метода engine.batch
      sig1.value = 10
      sig2.value = 20

      // Ждем окончания текущего цикла микрозадач (Event Loop)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

      // ПРОВЕРКА:
      // Если в вашей текущей версии ядра тест ПАДАЕТ (вызовов будет 2) — автобатчинга нет.
      // Иначе тест станет ЗЕЛЕНЫМ (вызов будет ровно 1)!
      expect(effectSpy).toHaveBeenCalledTimes(1)
      expect(effectSpy).toHaveBeenCalledWith(10, 20)
    })
  })

  // ==========================================
  // 5. ТЕСТЫ REACTIVE PROXY
  // ==========================================
  describe('Reactive Proxy', () => {
    it('должен отслеживать изменения глубоких свойств объекта', () => {
      const state = engine.reactive({ user: { age: 25 }, tags: ['js'] })
      const spy = vi.fn()

      engine.effect(() => {
        spy(state.user.age)
      })

      spy.mockClear()
      state.user.age = 26
      expect(spy).toHaveBeenCalledWith(26)
    })

    it('должен кешировать Proxy для одного и того же объекта', () => {
      const obj = { x: 1 }
      const proxy1 = engine.reactive(obj)
      const proxy2 = engine.reactive(obj)

      expect(proxy1).toBe(proxy2)
    })
  })

  // ==========================================
  // 6. ТЕСТЫ RESOURCES (АСИНХРОННЫЕ РЕСУРСЫ)
  // ==========================================
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

  // ==========================================
  // 8. ТЕСТЫ с Garbage Collector
  // Чтобы принудительно разорвать контекст выполнения и гарантировать,
  // что V8 полностью сотрет локальные ссылки из стека,
  // мы должны вынести создание computed в отдельную изолированную функцию верхнего уровня,
  // а вызов сборщика мусора сделать многократным с микро-паузами (setTimeout / setImmediate).
  // ==========================================
  describe('Автоочистка памяти через FinalizationRegistry', () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен автоматически стирать эффект из ядра, когда GC удаляет computed из памяти', async () => {
      if (typeof global.gc !== 'function') {
        console.warn('⚠️ Тест пропущен: Запустите vitest с флагом --expose-gc')
        return
      }

      const count = engine.signal(10)
      const getAllEffectsSize = () => (engine as unknown as EngineWithPrivate).allEffects.size
      const getCacheSize = () => (engine as unknown as EngineWithPrivate).computedCache.size

      const initialEffects = getAllEffectsSize()

      // 2. Вызываем изолированную функцию. Ссылка внутри нее умирает сразу после выполнения
      createTemporaryComputed(engine, count)

      // В ядре сейчас зафиксирован 1 эффект
      expect(getAllEffectsSize()).toBe(initialEffects + 1)
      expect(getCacheSize()).toBe(1)

      // 3. Запускаем агрессивный цикл сборки мусора (Full GC)
      // Иногда V8 требуется 2-3 прохода, чтобы переместить объект в старое поколение и полностью удалить
      for (let i = 0; i < 3; i++) {
        global.gc()
        // Делаем микропаузу, позволяя Event Loop переключить контексты задач
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // 4. Ожидаем, пока FinalizationRegistry асинхронно выполнит коллбек очистки ядра
      await vi.waitFor(() => {
        expect(getAllEffectsSize()).toBe(initialEffects)
        expect(getCacheSize()).toBe(0)
      })
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
