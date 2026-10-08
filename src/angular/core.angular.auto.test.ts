import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReactiveEngine4AngularAutomatic as ReactiveEngine } from './ReactiveEngine4Angular'

const onDestroySpy = { cb: () => { } }

vi.mock('@angular/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@angular/core')>()
  return {
    ...original,
    inject: vi.fn().mockImplementation((token: any) => {
      if (token === original.DestroyRef) {
        return { onDestroy: (callback: () => void) => { onDestroySpy.cb = callback } }
      }
      return original.inject(token)
    })
  }
})

describe('ReactiveEngine4AngularAutomatic (Automatic Async Flow)', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
    vi.restoreAllMocks()
  })

  it('должен АВТОМАТИЧЕСКИ склеивать каскад нативных Proxy-мутаций (.push, .splice) строго в 1 вызов Angular Signal без engine.batch()', async () => {
    const state = engine.reactive({
      todos: ['Task 1']
    })

    const angularSignal = engine.use(state)
    expect(angularSignal().todos.join(' | ')).toBe('Task 1')

    // КИЛЛЕР-ФИЧА: Множественные нативные мутации без иммутабельных оберток и БЕЗ engine.batch()!
    state.todos.push('Task 2')
    state.todos.push('Task 3')
    state.todos.splice(1, 1) // удалили 'Task 2'

    // Даем шедулеру микрозадач ядра собрать каскад уведомлений и прогнать эффекты
    await Promise.resolve()

    // Проверяем: Angular Signal атомарно обновился до финального состояния стейта!
    expect(angularSignal().todos.join(' | ')).toBe('Task 1 | Task 3')
  })
})
