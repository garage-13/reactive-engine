# `when`

Метод `when` (и вспомогательный метод `settleResources`) позволяет асинхронно ожидать выполнения реактивного условия (predicate), автоматически отписываясь от графа сразу после срабатывания, при ошибке или по таймауту. 

## Синтаксис

```typescript
await engine.when(predicate, options)
await engine.settleResources(resources, options)
```

## Параметры

* **predicate** (`() => boolean`): Реактивная функция-условие. Как только её результат станет `true`, возвращаемый Promise успешно завершится, а внутренняя подписка (`effect`) будет автоматически уничтожена.
* **options** (`WhenOptions`, опционально): 

  * **timeoutMs** (`number`): Максимальное время ожидания в миллисекундах. По истечении таймаута подписка очищается, а Promise отклоняется с ошибкой.
  * **signal** (`AbortSignal`): Внешний сигнал отмены. При его срабатывании подписка очищается, а Promise отклоняется с причиной отмены (signal.reason).

## Возвращаемое значение

Возвращает `Promise<void>`, который: 

* мгновенно разрешается (fast path без создания `effect`), если `predicate()` уже возвращает `true` в момент вызова;
* разрешается, как только реактивное условие переходит в `true`;
* отклоняется, если внутри `predicate()` выброшено исключение, истёк timeoutMs или сработал внешний `AbortSignal`.

## Примеры

### Ожидание каскадной загрузки данных на сервере (SSR)

В серверном рендеринге (Next.js, Nuxt, Express) when позволяет дождаться стабилизации цепочки зависимых ресурсов с пре-валидацией перед снятием снимка состояния: 

```typescript
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'

class ProfileSsrService extends AbstractService {
  public userId = this.engine.signal<string>('', 'ssr:userId')

  // Пре-валидация перед первым запросом
  public validUserId = this.engine.computed(() => {
    const id = this.userId.value.trim()
    return /^[a-z0-9-]{4,36}$/i.test(id) ? id : null
  }, 'ssr:validUserId')

  // API №1: профиль пользователя
  public userResource = this.engine.resource(
    async (id, signal) => {
      if (!id) return null
      const res = await fetch(`https://api.example.com/users/${id}`, { signal })
      return res.json() as Promise<{ id: string; orgId: string }>
    },
    this.validUserId,
    'ssr:userResource'
  )

  // API №2: организация (зависит от ответа API №1)
  public orgResource = this.engine.resource(
    async (user, signal) => {
      if (!user?.orgId) return null
      const res = await fetch(`https://api.example.com/orgs/${user.orgId}`, { signal })
      return res.json() as Promise<{ id: string; title: string }>
    },
    () => this.userResource.value.data,
    'ssr:orgResource'
  )
}

// Обработчик HTTP-запроса на сервере
export async function renderProfilePage(requestedId: string) {
  const engine = new ReactiveEngine()
  const service = engine.inject(ProfileSsrService)

  service.userId.value = requestedId

  // Ждём завершения всей цепочки запросов (не дольше 3 секунд)
  await engine.when(
    () => !service.userResource.value.loading && !service.orgResource.value.loading,
    { timeoutMs: 3000 }
  )

  return {
    user: service.userResource.value.data,
    org: service.orgResource.value.data,
  }
}
```

### Удобное ожидание массива ресурсов (`settleResources`)

Если нужно дождаться завершения загрузки сразу нескольких независимых или каскадных ресурсов без ручного перечисления флагов .`loading`: 

```typescript
await engine.settleResources(
  [service.userResource, service.orgResource],
  { timeoutMs: 3000 }
)
```

### Отмена ожидания через `AbortSignal`

```typescript
const engine = new ReactiveEngine()
const isReady = engine.signal(false)
const controller = new AbortController()

// Отменяем ожидание при размонтировании компонента или остановке запроса
setTimeout(() => controller.abort(new Error('Request cancelled')), 1000)

try {
  await engine.when(() => isReady.value, {
    timeoutMs: 5000,
    signal: controller.signal,
  })
} catch (err) {
  console.error('Ожидание прервано:', err)
}
```

## Дополнительная информация

* **Защита от утечек памяти:** Внутренний `effect` гарантированно уничтожается при любом исходе (`resolve`, `reject`, `timeoutMs` или `AbortSignal`).
* **Применение в тестах:** `engine.when(() => service.items.value.length > 0)` избавляет от необходимости писать искусственные задержки `setTimeout` при тестировании асинхронных потоков и WebSocket-событий.
