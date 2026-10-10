import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'
import { ReactiveEngineAutomatic } from './core.automatic'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic }
]

engines.forEach(({ name, Engine }) => {
  describe(`${name} — Асинхронные ресурсы (resource)`, () => {
    // Типизируем как базовый класс, чтобы полиморфно подходили оба
    let engine: ReactiveEngineCore

    beforeEach(() => {
      // ИСПРАВЛЕНО: Инстанцируем именно тот конструктор ядра, который идет в текущей итерации!
      engine = new Engine()
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

      // Смена источника обязана вызвать мгновенный abort и запустить второй фетч
      source.value = 'user_2'

      await Promise.resolve()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(res.loading).toBe(true)
    })
  })
})
