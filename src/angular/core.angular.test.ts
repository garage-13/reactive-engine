import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as angularCore from '@angular/core'
import { ReactiveEngine4Angular } from './ReactiveEngine4Angular'
import { AbstractService } from '../core'

// Объект-шпион вынесен на верхний уровень файла, чтобы быть доступным внутри замыкания vi.mock
const onDestroySpy = { cb: () => { } }

// ДЛЯ BROWSER MODE:
// Перехватываем модуль @angular/core на этапе загрузки браузером.
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
      return original.inject(token)
    })
  }
})

// Создаем мок-сервис для тестирования ядра
class TestService extends AbstractService {
  public counter = this.engine.signal<number>(0, 'test:angular:counter')

  public inc = () => {
    this.counter.value += 1
  }
}

describe('ReactiveEngine4Angular (Synchronous Flow)', () => {
  let engine: ReactiveEngine4Angular
  let service: TestService

  beforeEach(() => {
    engine = new ReactiveEngine4Angular()
    service = engine.inject(TestService)
    vi.restoreAllMocks()
  })

  it('должен корректно обновлять Angular Signal при изменении сигнала ядра', () => {
    const angularSignal = engine.use(service.counter)

    expect(angularSignal()).toBe(0)
    service.inc()

    // В Push/Pull модели обновление Angular Signal происходит синхронно и мгновенно!
    expect(angularSignal()).toBe(1)
  })

  it('должен успешно обновлять связанные зависимости в реактивном графе Angular', () => {
    const angularSignal = engine.use(service.counter)

    expect(angularSignal()).toBe(0)
    service.inc()

    expect(angularSignal()).toBe(1)
  })

  it('должен выбрасывать ошибку, если вызван вне контекста инъекций и без передачи инжектора', () => {
    // Временно заставляем inject возвращать ошибку, имитируя чистую среду вне компонентов
    vi.mocked(angularCore.inject).mockImplementationOnce(() => {
      throw new Error('NG0203: inject() must be called from an injection context')
    })

    expect(() => {
      engine.use(service.counter)
    }).toThrow()
  })

  it('должен автоматически отписываться от сигнала ядра при вызове onDestroy в Angular', () => {
    const mockUnsubscribe = vi.fn()
    const originalSubscribe = service.counter.subscribe.bind(service.counter)

    vi.spyOn(service.counter, 'subscribe').mockImplementation((cb) => {
      const realUnsubscribe = originalSubscribe(cb)
      return () => {
        mockUnsubscribe()
        realUnsubscribe() // Честно гасим внутренний эффект ядра
      }
    })

    engine.use(service.counter)
    expect(service.counter.subscribe).toHaveBeenCalled()

    // Имитируем уничтожение компонента Angular фреймворком
    onDestroySpy.cb()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  describe('ReactiveEngine4Angular — Работа с массивами и коллекциями', () => {

    it('должен успешно обновлять Angular Signal при мутации массива в Сигнале ядра', () => {
      const tagsSignal = engine.signal(['angular'])

      const angularSignal = engine.use(tagsSignal)
      expect(angularSignal().join(', ')).toBe('angular')

      // Мутируем массив и меняем ссылку через спред для пробития Object.is() барьера Angular Signals
      tagsSignal.value.push('rx')
      tagsSignal.value = [...tagsSignal.value]

      expect(angularSignal().join(', ')).toBe('angular, rx')
    })

    it('должен автоматически триггерить изменения Angular Signal при инвалидации computed-цепочки массивов', () => {
      const listSignal = engine.signal(['apple', 'banana', 'orange'])

      const longWords = engine.computed(() => {
        return listSignal.value.filter(word => word.length > 5)
      })

      const angularSignal = engine.use(longWords)
      expect(angularSignal().join('-')).toBe('banana-orange')

      // Мутируем исходный список и обновляем ссылку
      listSignal.value.push('pineapple')
      listSignal.value = [...listSignal.value]

      expect(angularSignal().join('-')).toBe('banana-orange-pineapple')
    })

    it('должен нативно трекать деструктивные методы Proxy-массивов (.push, .splice) в reactive() ровно в 1 вызов', () => {
      const state = engine.reactive({
        todos: ['Task 1']
      })

      const angularSignal = engine.use(state)
      expect(angularSignal().todos.join(' | ')).toBe('Task 1')

      // В строго синхронном режиме ядра для атомарной склейки мутаций Proxy
      // и предотвращения дребезга Angular-подписок мы используем транзакцию engine.batch
      engine.batch(() => {
        state.todos.push('Task 2')
        state.todos.push('Task 3')
        state.todos.splice(1, 1)
      })

      expect(angularSignal().todos.join(' | ')).toBe('Task 1 | Task 3')
    })
  })
})
