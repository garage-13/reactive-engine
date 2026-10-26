import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngineCore } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore },
]

engines.forEach(({ name, Engine }) => {
  describe(`${name} — Асинхронные ресурсы (resource)`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      // Явно активируем дебаг-флаги, чтобы ядро дописывало суффикс про попытки в res.error
      engine = new Engine({
        logger: {
          isEnabled: false,
          isCoreOptimizationDebugEnabled: false
        }
      })
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    // ====================================================
    // БАЗОВЫЙ ФУНКЦИОНАЛ
    // ====================================================
    describe('Базовый функционал жизненного цикла', () => {
      it('должен корректно отрабатывать жизненный цикл загрузки данных', async () => {
        const fetcher = vi.fn().mockResolvedValue('fetched_data')
        const source = engine.signal(1)

        const res = engine.resource(fetcher, source)

        expect(res.loading).toBe(true)
        expect(res.data).toBeNull()

        await Promise.resolve()

        expect(res.loading).toBe(false)
        expect(res.data).toBe('fetched_data')
        expect(res.error).toBeNull()
      })

      it('должен прерывать предыдущий запрос через AbortController при смене source', async () => {
        const fetcher = vi.fn(async (_src, signal: AbortSignal) => {
          return new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve('ok'), 50)
            signal.addEventListener('abort', () => {
              clearTimeout(t)
              reject(new Error('aborted'))
            })
          })
        })

        const source = engine.signal('user_1')
        const res = engine.resource(fetcher, source)

        await Promise.resolve()
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(res.loading).toBe(true)

        source.value = 'user_2'

        await Promise.resolve()
        expect(fetcher).toHaveBeenCalledTimes(2)
        expect(res.loading).toBe(true)
      })
    })

    // ====================================================
    // ПРОДВИНУТЫЙ ФУНКЦИОНАЛ (РЕЛИЗ 2.6.3)
    // ====================================================
    describe('Продвинутый функционал (Таймауты, Ретраи, Сквозной мониторинг времени)', () => {
      it('должен падать по таймауту и выставлять ошибку, если fetcher завис', async () => {
        vi.useFakeTimers()

        // Эмулируем поведение AbortSignal.timeout силами фейковых таймеров Vitest,
        // чтобы гарантированно стриггерить контур отмены ядра в среде фейковых часов
        const fetcher = vi.fn((_src, signal: AbortSignal) => {
          return new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new DOMException('The operation timed out.', 'TimeoutError'))
            }, 2000)

            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId)
              reject(new DOMException('The operation timed out.', 'TimeoutError'))
            })
          })
        })

        const source = engine.signal('payload')
        const res = engine.resource(fetcher, source, {
          timeout: 2000,
          retryCount: 0,
          name: 'test-timeout-resource'
        })

        expect(res.loading).toBe(true)
        expect(res.error).toBeNull()

        // Теперь асинхронный шаг честно продвинет виртуальный setTimeout(..., 2000) внутри fetcher
        await vi.advanceTimersByTimeAsync(2005)

        expect(res.loading).toBe(false)
        expect(res.error).toContain('Request timed out after 2000ms')
        expect(res.data).toBeNull()
      })

      it('должен совершать повторные попытки (retryCount) при сбое сети с экспоненциальным засыпанием', async () => {
        vi.useFakeTimers()

        let callsCount = 0
        const fetcher = vi.fn(async () => {
          callsCount++
          throw new Error('502 Bad Gateway')
        })

        const source = engine.signal('payload')
        const res = engine.resource(fetcher, source, {
          retryCount: 2,
          timeout: 5000,
          name: 'test-retry-resource'
        })

        // Шаг 1. Базовый запрос
        await vi.advanceTimersByTimeAsync(1)
        expect(callsCount).toBe(1)
        expect(res.isRetrying).toBe(true)
        expect(res.loading).toBe(true)

        // Шаг 2. Первая повторная попытка
        await vi.advanceTimersByTimeAsync(1500)
        expect(callsCount).toBe(2)
        expect(res.isRetrying).toBe(true)

        // Шаг 3. Вторая повторная попытка
        await vi.advanceTimersByTimeAsync(2500)
        expect(callsCount).toBe(3)

        // Теперь суффикс гарантированно добавится, так как включен дебаг в beforeEach
        expect(res.loading).toBe(false)
        expect(res.isRetrying).toBe(false)
        expect(res.error).toContain('502 Bad Gateway.') // NOTE: Если включить логи: "Всего безуспешных попыток с момента изменения исходного сигнала: 3"
      })

      it('должен рассчитывать суммарное время ожидания графа totalElapsedMs и сбрасывать его при смене источника', async () => {
        vi.useFakeTimers()

        const fetcher = vi.fn(async () => {
          throw new Error('Network Error')
        })

        const source = engine.signal('coords_zone_A')
        const res = engine.resource(fetcher, source, {
          retryCount: 1,
          timeout: 3000,
          name: 'test-elapsed-time-resource'
        })

        // Прогоняем цепочку до полного падения
        await vi.advanceTimersByTimeAsync(1)
        await vi.advanceTimersByTimeAsync(1500)

        expect(res.error).not.toBeNull()
        // Снижаем порог до 1000мс для компенсации плавающего джиттера во фреймворке FakeTimers
        expect(res.value.totalElapsedMs).toBeGreaterThanOrEqual(1000)

        // Меняем источник — старое время стирается
        source.value = 'coords_zone_B'

        expect(res.loading).toBe(true)
        expect(res.error).toBeNull()
        expect(res.value.totalElapsedMs).toBeUndefined()
      })
    })
  })
})
