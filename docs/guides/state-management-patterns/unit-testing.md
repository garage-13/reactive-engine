# Юнит-тестирование сервисов, сигналов и ресурсов (Vitest / Jest)

Поскольку вся бизнес-логика в **`@pravosleva/reactive-engine` v3.0.x** инкапсулируется внутри чистых TypeScript-классов `AbstractService` без привязки к DOM или UI-фреймворку, юнит-тесты выполняются в Node.js за миллисекунды — без необходимости монтировать компоненты через Testing Library или JSDOM.

## Три главных правила тестирования реактивного графа

1. **Изоляция инстанса `new ReactiveEngine()` в `beforeEach`:** Вместо глобального синглтона создавайте свежий экземпляр движка перед каждым тестом. Это гарантирует 100% изоляцию сигналов, кэшей декораторов и DI-контейнера между кейсами.
2. **Управление асинхронным батчингом (`queueMicrotask`):** Поскольку `engine.effect()` и `engine.resource()` планируют обновления через микрозадачи, в тестах после мутации сигнала достаточно дождаться одного тика (`await Promise.resolve()` или `await vi.runAllTimersAsync()`).
3. **Детерминированная перемотка времени (`vi.useFakeTimers()`):** Все временные декораторы (`withDebounce`, `withThrottle`, `withThrottleComputed`, `withLongPolling`) опираются на нативные `setTimeout` и `Date.now()`, поэтому тестируются мгновенно без реальных задержек `sleep`.

## Практический пример: Тестирование сервиса с DI, `resource` и `withDebounce`

### 1. Тестируемый сервис (`UserSearchService.ts`)

```typescript
import { AbstractService, withDebounce } from '@pravosleva/reactive-engine'

export interface UserDto {
  id: number
  name: string
}

export class ApiClientService extends AbstractService {
  public async searchUsers(query: string, signal: AbortSignal): Promise<UserDto[]> {
    const res = await fetch(`/api/users?q=${encodeURIComponent(query)}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
}

export class UserSearchService extends AbstractService {
  // Внедряем зависимость через DI-контейнер движка
  private api = this.engine.inject(ApiClientService)

  public query = this.engine.signal('', 'search:query')

  private debouncedSearch = withDebounce<string, UserDto[]>(
    (q, signal) => this.api.searchUsers(q, signal),
    { delay: 300 }
  )

  public usersResource = this.engine.resource(
    this.debouncedSearch,
    this.query,
    {
      name: 'search:usersResource',
      validateBeforeFetch: (q) => q.trim().length >= 2 || 'Минимум 2 символа',
    }
  )
}
```

### 2. Набор юнит-тестов (`UserSearchService.spec.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import {
  ApiClientService,
  UserSearchService,
  type UserDto,
} from './UserSearchService.js'

describe('UserSearchService', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    vi.useFakeTimers()
    // Создаём изолированный экземпляр ядра для каждого теста
    engine = new ReactiveEngine()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('блокирует сетевой запрос при вводе меньше 2 символов (validateBeforeFetch)', async () => {
    const api = engine.inject(ApiClientService)
    const searchSpy = vi.spyOn(api, 'searchUsers')
    const service = engine.inject(UserSearchService)

    service.query.value = 'a'
    await vi.advanceTimersByTimeAsync(350)

    expect(searchSpy).not.toHaveBeenCalled()
    expect(service.usersResource.value.error?.message).toBe('Минимум 2 символа')
  })

  it('отправляет запрос только один раз после паузы debounce в 300 мс', async () => {
    const mockUsers: UserDto[] = [{ id: 1, name: 'Алексей' }]
    const api = engine.inject(ApiClientService)
    const searchSpy = vi
      .spyOn(api, 'searchUsers')
      .mockResolvedValue(mockUsers)

    const service = engine.inject(UserSearchService)

    // Имитируем быстрый последовательный ввод
    service.query.value = 'Ал'
    await vi.advanceTimersByTimeAsync(150)

    service.query.value = 'Але'
    await vi.advanceTimersByTimeAsync(150)

    service.query.value = 'Алексей'
    // До истечения 300 мс с последнего ввода запрос ещё не должен уйти
    expect(searchSpy).not.toHaveBeenCalled()

    // Перематываем таймер на 300 мс и ждём завершения микрозадач
    await vi.advanceTimersByTimeAsync(300)

    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(searchSpy).toHaveBeenCalledWith('Алексей', expect.any(AbortSignal))
    expect(service.usersResource.value.data).toEqual(mockUsers)
    expect(service.usersResource.value.error).toBeNull()
  })

  it('отменяет предыдущий активный запрос при новом поиске (AbortSignal)', async () => {
    const capturedSignals: AbortSignal[] = []
    const api = engine.inject(ApiClientService)

    vi.spyOn(api, 'searchUsers').mockImplementation(
      (_query: string, signal: AbortSignal) => {
        capturedSignals.push(signal)
        return new Promise<UserDto[]>((resolve) => {
          setTimeout(() => resolve([]), 1000)
        })
      }
    )

    const service = engine.inject(UserSearchService)

    // 1. Запускаем первый запрос
    service.query.value = 'react'
    await vi.advanceTimersByTimeAsync(300)
    expect(capturedSignals).toHaveLength(1)
    expect(capturedSignals[0].aborted).toBe(false)

    // 2. Пока первый запрос выполняется (1000 мс), вводим новый запрос
    service.query.value = 'reactive'
    await vi.advanceTimersByTimeAsync(300)

    // Сигнал первого запроса должен автоматически перейти в aborted: true
    expect(capturedSignals[0].aborted).toBe(true)
    expect(capturedSignals).toHaveLength(2)
    expect(capturedSignals[1].aborted).toBe(false)
  })
})
```

## Рекомендации для продакшена

* **Используйте `vi.advanceTimersByTimeAsync()` вместо синхронного `vi.advanceTimersByTime()`:** В `@pravosleva/reactive-engine` планирование эффектов и ресурсов опирается на `queueMicrotask` и `Promise`. Асинхронный метод `advanceTimersByTimeAsync` сначала перематывает таймер `setTimeout`, а затем автоматически сбрасывает очередь микрозадач, избавляя от необходимости вручную писать `await Promise.resolve()`.
* **Подменяйте зависимости через `engine.inject()` до создания основного сервиса:** Поскольку `engine.inject(ApiClientService)` кэширует единственный экземпляр сервиса внутри конкретного `ReactiveEngine`, вызов `const api = engine.inject(ApiClientService)` и `vi.spyOn(api, ...)` перед `engine.inject(UserSearchService)` гарантирует, что тестируемый сервис получит уже замоканный экземпляр.
* **Проверяйте очистку подписок и таймеров:** Для сервисов с `withLongPolling`, `withThrottleComputed`, `WebSocket` или `Worker` добавляйте отдельный тест-кейс на вызов `service.dispose()` с проверкой `vi.getTimerCount() === 0`, чтобы убедиться в отсутствии висящих макрозадач.
