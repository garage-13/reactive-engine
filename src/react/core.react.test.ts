import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState, useEffect } from 'react'
import { renderHook, act } from '@testing-library/react' // Нужен для теста метода engine.use
import { ReactiveEngine4React as ReactiveEngine } from './ReactiveEngine4React'

describe('ReactiveEngine (React)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  // ==========================================
  // 7. ТЕСТЫ REACT ADAPTERS (МЕТОД engine.use)
  // ==========================================
  describe('React Adapters (engine.use)', () => {
    it('должен выбрасывать ошибку, если адаптеры React не установлены', () => {
      const engineWithoutAdapters = new ReactiveEngine()

      // Принудительно передаем null через as any, чтобы обойти строгую проверку типов в тесте
      engineWithoutAdapters.setReactAdapters(null as any, null as any)

      const sig = engineWithoutAdapters.signal(0)

      expect(() => engineWithoutAdapters.use(sig)).toThrow(
        'this.reactAdapters.useState is not a function or its return value is not iterable'
      )
    })

    it('должен успешно синхронизировать сигнал с хуками React', async () => {
      engine.setReactAdapters(useState, useEffect)
      const sig = engine.signal('hello')

      const { result } = renderHook(() => engine.use(sig))
      expect(result.current).toBe('hello')

      // Изменяем сигнал внутри act. Так как act в React умеет сам дожидаться асинхронных микрозадач,
      // нам просто нужно использовать async/await версию act
      await act(async () => {
        sig.value = 'world'
      })

      expect(result.current).toBe('world')
    })
  })
})
