import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from '../../core'
import { withValidationSync, withValidationAsync, ValidationSchema } from './withValidation'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false }
]

interface TestState {
  step: number
  username: string
  email: string
}

engines.forEach(({ name, Engine }) => {
  describe(`${name} — Валидационные Декораторы (withValidationSync & withValidationAsync)`, () => {
    let engine: ReactiveEngine
    let errorsSignal: any

    beforeEach(() => {
      engine = new ReactiveEngine()
      // Инициализируем атомарный сигнал для накопления ошибок валидации
      errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

      /* NOTE: Включаем виртуальные таймеры перед каждым тестом
      1. vi.useFakeTimers() полностью подменяет нативные функции setTimeout, clearTimeout и queueMicrotask внутри реактивного ядра на управляемые Vitest заглушки.
      2. Метод await vi.runAllTimersAsync() теперь сможет легально перехватить очередь запланированных микрозадач и внутренних эффектов engine.resource, мгновенно продвинув выполнение асинхронного фетчера до момента проверки утверждений expect.
      */
      vi.useFakeTimers()
    })

    afterEach(() => {
      // 🟢 ИСПРАВЛЕНИЕ: Возвращаем реальное время после каждого теста
      vi.useRealTimers()
    })

    // =========================================================================
    // БЛОК 1: СИНХРОННЫЙ ДЕКОРАТОР (withValidationSync)
    // =========================================================================
    describe('withValidationSync — Синхронные Экшены / Операции', () => {

      it('должен успешно пропускать экшен и очищать сигнал ошибок, если данные валидны', () => {
        const targetActionSpy = vi.fn((multiplier: number) => 42 * multiplier)

        const schema: ValidationSchema<TestState> = {
          step: (val) => (val > 0 ? true : 'Шаг должен быть больше нуля')
        }

        const validatedAction = withValidationSync(targetActionSpy, {
          schema,
          errorsSignal
        })

        const currentState: TestState = { step: 1, username: 'dan', email: 'test@test.com' }

        // Запускаем экшен с валидным состоянием и аргументами
        const result = validatedAction(currentState, 2)

        expect(result).toBe(84)
        expect(targetActionSpy).toHaveBeenCalledTimes(1)
        expect(targetActionSpy).toHaveBeenCalledWith(2)
        expect(errorsSignal.value).toEqual({}) // Ошибок нет
      })

      it('должен блокировать выполнение экшена и наполнять сигнал ошибок при нарушении схемы', () => {
        const targetActionSpy = vi.fn()

        const schema: ValidationSchema<TestState> = {
          username: (val) => (val.length >= 3 ? true : 'Имя слишком короткое'),
          email: (val) => (val.includes('@') ? true : 'Некорректный email')
        }

        const validatedAction = withValidationSync(targetActionSpy, {
          schema,
          errorsSignal
        })

        const invalidState: TestState = { step: 1, username: 'io', email: 'invalid-mail' }

        // Вызываем экшен с невалидными данными
        const result = validatedAction(invalidState)

        // Экшен заблокирован (возвращает void), ошибки проброшены в граф реактивности
        expect(result).toBeUndefined()
        expect(targetActionSpy).not.toHaveBeenCalled()
        expect(errorsSignal.value).toEqual({
          username: 'Имя слишком короткое',
          email: 'Некорректный email'
        })
      })

      it('должен предоставлять валидатору доступ ко всему объекту состояния (кросс-валидация)', () => {
        const targetActionSpy = vi.fn()

        // Проверяем зависимость полей: на 2 шаге имя обязано быть администратором
        const schema: ValidationSchema<TestState> = {
          username: (val, state) => {
            if (state.step === 2 && val !== 'admin') {
              return 'На втором шаге имя должно быть admin'
            }
            return true
          }
        }

        const validatedAction = withValidationSync(targetActionSpy, {
          schema,
          errorsSignal
        })

        const state: TestState = { step: 2, username: 'guest', email: 'admin@test.com' }
        validatedAction(state)

        // Проверяем, что экшен заблокирован, а ошибка записана в реактивный сигнал
        expect(targetActionSpy).not.toHaveBeenCalled()
        expect(errorsSignal.value.username).toBe('На втором шаге имя должно быть admin')
      })

    })

    // =========================================================================
    // БЛОК 2: АСИНХРОННЫЙ ДЕКОРАТОР РЕСУРСОВ (withValidationAsync)
    // =========================================================================
    describe('withValidationAsync — Асинхронные Фетчеры (engine.resource)', () => {

      it('должен прозрачно выполнять fetcher и возвращать промис с данными, если ресурс валиден', async () => {
        const mockData = { id: 202, status: 'active' }
        const mockFetcherSpy = vi.fn(async (source: TestState, _signal: AbortSignal) => mockData)
        const abortSignal = new AbortController().signal

        const schema: ValidationSchema<TestState> = {
          email: (val) => (val.endsWith('.com') ? true : 'Разрешена только зона .com')
        }

        const validatedFetcher = withValidationAsync(mockFetcherSpy, {
          schema,
          errorsSignal
        })

        const validSource: TestState = { step: 1, username: 'dan', email: 'dan@reactive.com' }

        // Выполняем асинхронный фетч через валидатор
        const result = await validatedFetcher(validSource, abortSignal)

        expect(result).toEqual(mockData)
        expect(mockFetcherSpy).toHaveBeenCalledTimes(1)
        expect(errorsSignal.value).toEqual({})
      })

      it('должен выбрасывать стоп-исключение и блокировать сетевой фетчер при невалидном состоянии источника ресурса', async () => {
        const mockFetcherSpy = vi.fn(async (_source: TestState, _signal: AbortSignal) => ({ ok: true }))
        const abortSignal = new AbortController().signal

        const schema: ValidationSchema<TestState> = {
          step: (val) => (val > 0 ? true : 'Некорректный шаг источника')
        }

        const validatedFetcher = withValidationAsync(mockFetcherSpy, {
          schema,
          errorsSignal
        })

        const invalidSource: TestState = { step: -5, username: 'anonymous', email: 'anon@mail.ru' }

        // Декларативный ресурс обязан перехватить ошибку и выбросить Core validation stopper
        await expect(validatedFetcher(invalidSource, abortSignal)).rejects.toThrow('Core validation stopper')

        // Сетевой фетчер гарантированно защищен от выполнения при невалидном источнике!
        expect(mockFetcherSpy).not.toHaveBeenCalled()
        expect(errorsSignal.value).toEqual({
          step: 'Некорректный шаг источника'
        })
      })

      it('должен интегрироваться в рантайм ядра и наполнять сигнал ошибок при мутации источника ресурса', async () => {
        const mockFetcherSpy = vi.fn(async (user: { age: number }, _sig: AbortSignal) => `processed_${user.age}`)

        // Создаем реактивный сигнал-источник для engine.resource
        const sourceSignal = engine.signal({ age: 20 }, 'resource:source')

        const schema = {
          age: (val: number) => (val >= 18 ? true : 'Возраст должен быть строго 18+')
        }

        const validatedFetcher = withValidationAsync(mockFetcherSpy, {
          schema,
          errorsSignal
        })

        // Инициализируем реактивный ресурс реактивного ядра
        const userResource = engine.resource(validatedFetcher, sourceSignal, 'user:validated:resource')

        // 1. Проверяем валидное стартовое состояние графа
        await vi.runAllTimersAsync()
        expect(userResource.data).toBe('processed_20')
        expect(errorsSignal.value).toEqual({})

        // Имитируем падение бэкенда на случай прорыва валидации (для жесткого контроля блокировки)
        mockFetcherSpy.mockClear()

        // 2. Императивно мутируем источник до невалидного значения (Меньше 18 лет)
        sourceSignal.value = { age: 16 }

        // Прокручиваем макрозадачи ядра для прогона внутренних эффектов ресурса
        await vi.runAllTimersAsync()

        // Проверяем топологию графа: фетчер заблокирован валидацией, ресурс перешел в стейт ошибки
        expect(mockFetcherSpy).not.toHaveBeenCalled()
        expect(userResource.error).toContain('Core validation stopper')
        expect(errorsSignal.value).toEqual({
          age: 'Возраст должен быть строго 18+'
        })
      })

    })
  })
})
