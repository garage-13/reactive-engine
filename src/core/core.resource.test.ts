import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine, ReactiveEngineAutomatic } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — Асинхронные ресурсы (resource)`, () => {
    let engine: ReactiveEngine

    beforeEach(() => {
      engine = new ReactiveEngine()
    })

    it('должен корректно отрабатывать жизненный цикл загрузки данных', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched_data')
      const source = engine.signal(1)

      // Инициализируем ресурс — он переводит стейт в loading: true
      const res = engine.resource(fetcher, source)

      expect(res.loading).toBe(true)
      expect(res.data).toBeNull()

      // Даем промису fetcher ровно один шаг прокрутки в Event Loop
      await Promise.resolve()

      // Проверяем финальное состояние — дедлок разорван, данные на месте!
      expect(res.loading).toBe(false)
      expect(res.data).toBe('fetched_data')
      expect(res.error).toBeNull()
    })

    it('должен прерывать предыдущий запрос через AbortController при смене source', async () => {
      const fetcher = vi.fn(async (_src, signal: AbortSignal) => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve('ok'), 50)
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) })
        })
      })

      const source = engine.signal('user_1')
      const res = engine.resource(fetcher, source)

      await Promise.resolve()
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(res.loading).toBe(true)

      // Смена источника обязана вызвать мгновенный abort и запустить второй фетч
      source.value = 'user_2'

      await Promise.resolve()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(res.loading).toBe(true)
    })
  })
})
