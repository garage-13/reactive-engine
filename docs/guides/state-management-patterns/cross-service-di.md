# Кросс-сервисное взаимодействие и DI

В крупных приложениях бизнес-логика редко умещается в один монолитный класс. Вместо создания глобальных синглтонов и жёстких перекрёстных импортов `@pravosleva/reactive-engine` позволяет разбивать состояние на независимые домены-сервисы и связывать их через встроенный DI-контейнер.

## Как работает `inject` внутри `AbstractService`

Каждый сервис, унаследованный от `AbstractService`, имеет прямой доступ к породившему его экземпляру движка через `this.engine`. Вызов `this.engine.inject(TargetService)` внутри конструктора или методов извлекает синглтон-экземпляр целевого сервиса из локального реестра текущего движка (или лениво инициализирует его при первом обращении).

### Основные преимущества
* **Отсутствие глобального состояния:** Каждый инстанс `new ReactiveEngine()` хранит свой изолированный реестр сервисов. Это упрощает тестирование (каждый тест получает чистый граф) и безопасно для SSR.
* **Реактивная композиция:** Вычисляемые свойства (`computed`) и асинхронные ресурсы (`resource`) одного сервиса могут напрямую читать сигналы другого сервиса.
* **Совместимость с `nodenext`:** Импорты типов и классов полностью поддерживают строгое разрешение модулей ECMAScript (`.js` расширения в декларациях).

## Практический пример: Авторизация и загрузка профиля

Рассмотрим связку из двух сервисов: `AuthService` (хранит токен доступа) и `ProfileService` (автоматически загружает данные пользователя при появлении токена и отменяет запрос при логауте).

### 1. Слой сервисов (`services.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

// Сервис авторизации (управляет токеном)
export class AuthService extends AbstractService {
  public token = this.engine.signal<string | null>(null, 'auth:token')

  public isAuthenticated = this.engine.computed(
    () => Boolean(this.token.value),
    'auth:isAuthenticated'
  )

  public login(newToken: string) {
    this.token.value = newToken
  }

  public logout() {
    this.token.value = null
  }
}

// Сервис профиля (зависит от AuthService через DI)
export class ProfileService extends AbstractService {
  // Внедряем AuthService из контейнера текущего движка
  private auth = this.engine.inject(AuthService)

  // Ресурс автоматически реагирует на изменение this.auth.token.value
  public profileResource = this.engine.resource(
    async (token, abortSignal) => {
      if (!token) return null

      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка загрузки профиля: ${res.status}`)
      }

      return res.json()
    },
    this.auth.token,
    {
      name: 'profile:resource',
      // Запрос не уйдёт в сеть, пока токен равен null
      validateBeforeFetch: (token) => Boolean(token) || 'Необходима авторизация',
    }
  )
}
```

### 2. Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { AuthService, ProfileService } from './services.js'

const engine = new ReactiveEngine()

// Получаем инстансы из DI-контейнера
const auth = engine.inject(AuthService)
const profile = engine.inject(ProfileService)

// Подписываемся на состояние профиля
engine.effect(() => {
  const { data, loading, error } = profile.profileResource.value
  console.log({ loading, data, error })
})

// 1. Вход в систему -> автоматически запустится GET /api/me
auth.login('eyJhbGciOiJIUzI1Ni...')

// 2. Выход из системы -> если запрос ещё шёл, он мгновенно отменится через AbortController
auth.logout()
```

::: tip Избегайте циклических зависимостей в DI
Если `ServiceA` вызывает `this.engine.inject(ServiceB)` в теле конструктора, а `ServiceB` в своём конструкторе вызывает `this.engine.inject(ServiceA)`, движок выбросит ошибку циклической зависимости DI. Если двусторонняя связь действительно необходима, вызывайте `this.engine.inject(...)` лениво внутри метода или внутри колбэка `computed` / `effect`.
:::
