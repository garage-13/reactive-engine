import { describe, it, expect, vi } from 'vitest'
import * as angularCore from '@angular/core'
import { ReactiveEngine4Angular } from './ReactiveEngine4Angular'
import { AbstractService } from '../core'

// Объект-шпион вынесен на верхний уровень файла, чтобы быть доступным внутри замыкания vi.mock
const onDestroySpy = { cb: () => { } }

// ДЛЯ BROWSER MODE:
// Перехватываем модуль @angular/core на этапе загрузки браузером.
// Это единственный способ обойти "Module namespace is not configurable" в ESM.
vi.mock('@angular/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@angular/core')>()
  return {
    ...original,
    inject: vi.fn().mockImplementation((token: any) => {
      // Если адаптер запрашивает DestroyRef — отдаем наш контролируемый мок
      if (token === original.DestroyRef) {
        return {
          onDestroy: (callback: () => void) => {
            onDestroySpy.cb = callback
          }
        }
      }
      // Для всех остальных системных токенов вызываем оригинальный inject фреймворка
      return original.inject(token)
    })
  }
})

// 1. Создаем мок-сервис для тестирования ядра
class TestService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'test:angular:counter')

  public inc = () => {
    this.counter.value += 1
  }
}

describe('ReactiveEngine4Angular', () => {
  // Хелпер для прокачки асинхронной очереди микротасок Angular Signals
  const flushAngularEffects = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('должен корректно обновлять Angular Signal при изменении сигнала ядра', async () => {
    const engine = new ReactiveEngine4Angular()
    const service = engine.inject(TestService)

    // Эмулируем Injection Context. Наш глобальный мок inject перехватит вызов
    const angularSignal = engine.use(service.counter)

    expect(angularSignal()).toBe(0)
    service.inc()

    await flushAngularEffects()
    expect(angularSignal()).toBe(1)
  })

  it('должен успешно обновлять связанные зависимости в реактивном графе Angular', async () => {
    const engine = new ReactiveEngine4Angular()
    const service = engine.inject(TestService)

    const angularSignal = engine.use(service.counter)

    expect(angularSignal()).toBe(0)
    service.inc()

    await flushAngularEffects()
    expect(angularSignal()).toBe(1)
  })

  it('должен выбрасывать ошибку, если вызван вне контекста инъекций и без передачи инжектора', () => {
    const engine = new ReactiveEngine4Angular()
    const service = engine.inject(TestService)

    // Временно заставляем inject возвращать ошибку, имитируя чистую среду вне компонентов
    vi.mocked(angularCore.inject).mockImplementationOnce(() => {
      throw new Error('NG0203: inject() must be called from an injection context')
    })

    expect(() => {
      engine.use(service.counter)
    }).toThrow()
  })

  it('должен автоматически отписываться от сигнала ядра при вызове onDestroy в Angular', async () => {
    // 1. Включаем фейковые таймеры, чтобы Vitest перехватил любые скрытые setTimeout от Angular
    vi.useFakeTimers()

    const engine = new ReactiveEngine4Angular()
    const service = engine.inject(TestService)

    const mockUnsubscribe = vi.fn()
    const originalSubscribe = service.counter.subscribe.bind(service.counter)

    vi.spyOn(service.counter, 'subscribe').mockImplementation((cb) => {
      const realUnsubscribe = originalSubscribe(cb)
      return () => {
        mockUnsubscribe()
        realUnsubscribe() // Честно гасим внутренний эффект ядра
      }
    })

    // Инициализируем подписку
    engine.use(service.counter)
    expect(service.counter.subscribe).toHaveBeenCalled()

    // Имитируем уничтожение компонента Angular фреймворком
    onDestroySpy.cb()

    // Проверяем вызов шпиона
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)

    // 2. Прокручиваем и очищаем ВСЕ таймеры, которые мог создать фреймворк под капотом
    await vi.runAllTimersAsync()

    // 3. Возвращаем нативное время
    vi.useRealTimers()

    // 4. Финальная зачистка макрозадач
    await new Promise((r) => setImmediate(r))
  })
})
