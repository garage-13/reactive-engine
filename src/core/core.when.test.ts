import { describe, it, expect, vi, afterEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine.when() & settleResources()', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('резолвится мгновенно (fast path), если условие уже истинно', async () => {
    const engine = new ReactiveEngine()
    const ready = engine.signal(true)
    const predicate = vi.fn(() => ready.value)

    await expect(engine.when(predicate)).resolves.toBeUndefined()
    expect(predicate).toHaveBeenCalledTimes(1)
  })

  it('ожидает асинхронного изменения сигнала и автоматически отписывается', async () => {
    const engine = new ReactiveEngine()
    const step = engine.signal(0)
    const spy = vi.fn(() => step.value >= 2)

    const promise = engine.when(spy)
    // 1-й вызов: синхронный fast-path, 2-й вызов: первичный прогон effect() для сбора зависимостей
    expect(spy).toHaveBeenCalledTimes(2)

    step.value = 1
    expect(spy).toHaveBeenCalledTimes(3)

    step.value = 2
    await expect(promise).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(4)

    // После резолва эффект обязан быть уничтожен: дальнейшие записи не вызывают предикат
    step.value = 3
    step.value = 4
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('корректно ждёт цепочку зависимых computed и асинхронных обновлений', async () => {
    const engine = new ReactiveEngine()
    const userId = engine.signal<string | null>(null)
    const user = engine.signal<{ id: string; orgId: string } | null>(null)
    const org = engine.signal<{ id: string; name: string } | null>(null)

    const isAllLoaded = engine.computed(
      () => Boolean(userId.value && user.value && org.value)
    )

    const waitPromise = engine.when(() => isAllLoaded.value)

    // Имитация каскадной загрузки (шаг 1 -> шаг 2 -> шаг 3)
    setTimeout(() => {
      userId.value = 'u-42'
      setTimeout(() => {
        user.value = { id: 'u-42', orgId: 'org-7' }
        setTimeout(() => {
          org.value = { id: 'org-7', name: 'Garage 13' }
        }, 10)
      }, 10)
    }, 10)

    await expect(waitPromise).resolves.toBeUndefined()
    expect(org.value?.name).toBe('Garage 13')
  })

  it('отклоняет промис по таймауту и очищает подписку', async () => {
    vi.useFakeTimers()
    const engine = new ReactiveEngine()
    const flag = engine.signal(false)
    const spy = vi.fn(() => flag.value)

    const promise = engine.when(spy, { timeoutMs: 500 })
    const assertion = expect(promise).rejects.toThrow(/timed out after 500ms/)

    await vi.advanceTimersByTimeAsync(500)
    await assertion

    const callsAfterTimeout = spy.mock.calls.length
    expect(callsAfterTimeout).toBe(2)

    // Проверяем, что после таймаута эффект отписан и не срабатывает
    flag.value = true
    expect(spy).toHaveBeenCalledTimes(callsAfterTimeout)
  })

  it('отклоняет промис при отмене через внешний AbortSignal', async () => {
    const engine = new ReactiveEngine()
    const flag = engine.signal(false)
    const controller = new AbortController()

    const promise = engine.when(() => flag.value, { signal: controller.signal })
    controller.abort(new Error('Custom abort reason'))

    await expect(promise).rejects.toThrow('Custom abort reason')
  })

  it('пробрасывает исключение, если предикат выбросил ошибку', async () => {
    const engine = new ReactiveEngine()
    const trigger = engine.signal(false)

    const promise = engine.when(() => {
      if (trigger.value) throw new Error('Predicate failure')
      return false
    })

    trigger.value = true
    await expect(promise).rejects.toThrow('Predicate failure')
  })
})
