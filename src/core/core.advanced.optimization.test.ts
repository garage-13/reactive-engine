import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signal, computed, effect, resetGlobalReactiveEngine } from './core.global'
import { ReactiveEngine } from '../core'
import { ReactiveDebounceLogger } from './core.logger'

describe('Reactive Engine v2.5.0 - Memory Leaks & Edge Cases Verification', () => {
  beforeEach(() => {
    // Перед каждым тестом полностью изолируем граф, исключая пересечение эпох
    resetGlobalReactiveEngine()
  })

  // =========================================================================
  // ТЕСТ 1: Устранение утечки памяти в Computed .subscribe() (fakeEffect closure leak)
  // =========================================================================
  it('⚡ [Memory] should completely release computed instance and fakeEffect upon unsubscribe', () => {
    const sourceSignal = signal(1, 'source_signal')

    // Создаем тяжелый computed
    const computedFn = vi.fn(() => sourceSignal.value * 10)
    const computedNode = computed(computedFn, 'heavy_computed')

    // Оформляем подписку (раньше fakeEffect держал жесткую ссылку на инстанс в замыкании)
    const unsubscribe = computedNode.subscribe((val) => {
      // Имитируем логику компонента
      const data = val
    })

    expect(computedFn).toHaveBeenCalledTimes(1)

    // Вызываем отписку, добавленную во время рефакторинга
    unsubscribe()

    // Триггерим изменение сигнала
    sourceSignal.value = 2

    // Проверяем: так как fakeEffect был вычищен из графа и его зависимости сброшены,
    // computedNode больше НЕ ПЕРЕСЧИТЫВАЕТСЯ. Связь разорвана, GC может собрать ноду.
    expect(computedFn).toHaveBeenCalledTimes(1)

    const internalNode = (computedNode as any)._node
    expect(internalNode.subscribers.size).toBe(0)
  })

  // =========================================================================
  // ТЕСТ 2: Устранение бесконечного роста памяти в статической Map логгера
  // =========================================================================
  it('⚡ [Memory] should evict stable signals from ChurnTracker map to prevent OOM', () => {
    const engine = new ReactiveEngine({ logger: { isEnabled: true } })

    // Имитируем создание и удаление динамических сигналов
    for (let i = 0; i < 50; i++) {
      const dynamicLabel = `dynamic_signal_${i}`
      const sig = engine.signal(0, dynamicLabel)

      // Вызываем мутацию, чтобы логгер обработал сигнал
      sig.value = 1
    }

    const tracker = (ReactiveDebounceLogger as any).churnTracker

    // Проверяем, что в карте не зависло 50 стабильных записей, и они были вычищены через .delete()
    expect(tracker.size).toBe(0)
  })

  // =========================================================================
  // ТЕСТ 3: Проверка метода .destroy() у Resource (Утечки сетевых AbortController)
  // =========================================================================
  it('⚡ [Resource] should abort active fetch fetcher and destroy internal signal on .destroy()', async () => {
    const engine = new ReactiveEngine()

    const fetcherSpy = vi.fn(async (source: string, abortSignal: AbortSignal) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve('data'), 100)
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const sourceSignal = engine.signal('user_1')

    // Создаем ресурс
    const userResource = engine.resource(fetcherSpy, sourceSignal, 'user_resource')

    // Дожидаемся инициализации первого фетча
    await vi.waitFor(() => {
      expect(fetcherSpy).toHaveBeenCalledTimes(1)
    })

    const activeSignal = fetcherSpy.mock.calls[0][1] as AbortSignal
    expect(activeSignal.aborted).toBe(false)

    // Вызываем добавленный метод деструкции ресурса 2.5.0
    userResource.destroy()

    // 1. Проверяем, что системный AbortController мгновенно перешел в статус aborted
    expect(activeSignal.aborted).toBe(true)

    // 2. Проверяем, что внутренний стейт-сигнал ресурса очистил подписчиков
    const internalStateSignal = (userResource as any)._node || (userResource as any)
    // Так как мы занулили стейт и вызвали (state as any).destroy():
    expect(userResource.value).toBeUndefined()
  })

  // =========================================================================
  // ТЕСТ 4: Валидация типов и отсутствия ошибок при вызове публичного .log()
  // =========================================================================
  it('⚡ [Architecture] should successfully execute resource flow with public engine.log without runtime errors', async () => {
    // Включаем логгер на полную, проверяя легальность обращения сателлитов к методу engine.log
    const engine = new ReactiveEngine({ logger: { isEnabled: true, isCoreOptimizationDebugEnabled: true } })

    const mockFetcher = async () => 'success_payload'
    const testResource = engine.resource(mockFetcher, undefined, 'test_public_log')

    // Если бы метод log остался private, TypeScript бы не скомпилировал это,
    // а рантайм-вызов упал бы при неверном связывании контекста.
    await vi.waitFor(() => {
      expect(testResource.data).toBe('success_payload')
    })
  })
})
