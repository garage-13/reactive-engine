# Серверный рендеринг (SSR) и каскадная загрузка данных по нескольким API

При серверном рендеринге (Next.js App Router, Nuxt 3/4, Angular Universal, Express/Fastify) перед отправкой HTML клиенту часто требуется выполнить цепочку сетевых запросов, где одни запросы зависят от ответов других, а перед отправкой каждого запроса нужна строгая **пре-валидация параметров** (чтобы не бить по бэкенду заведомо невалидными ID или при отсутствии прав). 

Надёжная архитектура SSR в @pravosleva/reactive-engine строится на четырёх элементах: 

1. **Изолированный контейнер `new ReactiveEngine()` на каждый входящий HTTP-запрос** (исключает утечку состояния между параллельными сессиями пользователей).
2. **Пре-валидация через `computed`:** промежуточный вычисляемый узел проверяет входные параметры и возвращает `null` (или объект-дискриминатор), если запрос выполнять не нужно.
3. **Каскадные `engine.resource()`:** каждый следующий ресурс подписывается на данные предыдущего и запускается автоматически только после успешного завершения родительского шага.
4. **Ожидание стабилизации графа через `engine.when()` / `engine.settleResources()`:** серверный обработчик дожидается завершения всей цепочки с жёстким лимитом времени (`timeoutMs`) и снимает сериализуемый снимок (`exportSnapshot()`) для гидратации на клиенте.

## Полный пример: пре-валидация → профиль пользователя → данные организации → права доступа

```typescript
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine'

export interface UserDto {
  id: string
  orgId: string
  role: 'admin' | 'member' | 'guest'
}

export interface OrgDto {
  id: string
  title: string
  plan: 'free' | 'enterprise'
}

export interface DashboardSnapshot {
  userId: string
  validationError: string | null
  user: UserDto | null
  org: OrgDto | null
  permissions: string[]
}

export class DashboardSsrService extends AbstractService {
  // 1. Входные параметры HTTP-запроса (из URL / headers / cookies)
  public rawUserId = this.engine.signal<string>('', 'ssr:rawUserId')
  public authToken = this.engine.signal<string | null>(null, 'ssr:authToken')

  // 2. Синхронная пре-валидация перед первым сетевым запросом
  public validatedRequest = this.engine.computed(() => {
    const id = this.rawUserId.value.trim()
    const token = this.authToken.value

    if (!token) {
      return { ok: false as const, reason: 'Unauthorized: missing token' }
    }
    if (!/^[a-z0-9-]{4,36}$/i.test(id)) {
      return { ok: false as const, reason: 'Invalid userId format' }
    }

    return { ok: true as const, userId: id, token }
  }, 'ssr:validatedRequest')

  // 3. API №1: Загрузка профиля пользователя (запускается только если validatedRequest.ok === true)
  public userResource = this.engine.resource(
    async (req, signal) => {
      if (!req.ok) return null

      const res = await fetch(`https://api.example.com/users/${encodeURIComponent(req.userId)}`, {
        headers: { Authorization: `Bearer ${req.token}` },
        signal,
      })
      if (!res.ok) throw new Error(`User API HTTP ${res.status}`)
      return res.json() as Promise<UserDto>
    },
    this.validatedRequest,
    'ssr:userResource'
  )

  // 4. Пре-валидация для зависимого API №2 (проверяем ответ API №1 и роль пользователя)
  public orgQuery = this.engine.computed(() => {
    const req = this.validatedRequest.value
    const user = this.userResource.value.data

    if (!req.ok || !user || user.role === 'guest' || !user.orgId) {
      return null
    }

    return { orgId: user.orgId, token: req.token }
  }, 'ssr:orgQuery')

  // 5. API №2: Загрузка организации (автоматически стартует после API №1)
  public orgResource = this.engine.resource(
    async (query, signal) => {
      if (!query) return null

      const res = await fetch(`https://api.example.com/orgs/${encodeURIComponent(query.orgId)}`, {
        headers: { Authorization: `Bearer ${query.token}` },
        signal,
      })
      if (!res.ok) throw new Error(`Org API HTTP ${res.status}`)
      return res.json() as Promise<OrgDto>
    },
    this.orgQuery,
    'ssr:orgResource'
  )

  // 6. API №3: Загрузка матрицы прав (зависит одновременно от User и Org)
  public permissionsResource = this.engine.resource(
    async ([user, org, req], signal) => {
      if (!req.ok || !user || !org || org.plan !== 'enterprise') {
        return [] as string[]
      }

      const res = await fetch(
        `https://api.example.com/orgs/${encodeURIComponent(org.id)}/permissions/${encodeURIComponent(user.id)}`,
        {
          headers: { Authorization: `Bearer ${req.token}` },
          signal,
        }
      )
      if (!res.ok) throw new Error(`Permissions API HTTP ${res.status}`)
      return res.json() as Promise<string[]>
    },
    () => [this.userResource.value.data, this.orgResource.value.data, this.validatedRequest.value] as const,
    'ssr:permissionsResource'
  )

  // 7. Сериализуемый снимок для передачи в HTML-payload (Next.js / Nuxt / TransferState)
  public exportSnapshot(): DashboardSnapshot {
    const req = this.validatedRequest.value
    return {
      userId: this.rawUserId.value,
      validationError: req.ok ? null : req.reason,
      user: this.userResource.value.data ?? null,
      org: this.orgResource.value.data ?? null,
      permissions: this.permissionsResource.value.data ?? [],
    }
  }

  // 8. Восстановление состояния на клиенте без повторных запросов
  public hydrate(snapshot: DashboardSnapshot | null) {
    if (!snapshot) return
    this.rawUserId.value = snapshot.userId
    // Записываем предзагруженные данные напрямую в ресурсы/сигналы клиента
    if (snapshot.user) this.userResource.mutate(snapshot.user)
    if (snapshot.org) this.orgResource.mutate(snapshot.org)
    if (snapshot.permissions.length) this.permissionsResource.mutate(snapshot.permissions)
  }
}
```

## Обработчик запроса на сервере (Server Handler)

На стороне сервера создаём изолированный ReactiveEngine, устанавливаем параметры входящего запроса и ждём стабилизации всех ресурсов с жёстким таймаутом: 

```typescript
export async function handleSsrRequest(
  userId: string,
  token: string | null,
  requestAbortSignal?: AbortSignal
): Promise<DashboardSnapshot> {
  // 1. Строгая изоляция на каждый HTTP-запрос
  const serverEngine = new ReactiveEngine()
  const dashboard = serverEngine.inject(DashboardSsrService)

  // 2. Задаём входные параметры (батчем, чтобы граф пересчитался за один проход)
  serverEngine.batch(() => {
    dashboard.rawUserId.value = userId
    dashboard.authToken.value = token
  })

  try {
    // 3. Ждём завершения всей каскадной цепочки (не дольше 2.5 секунд)
    await serverEngine.settleResources(
      [dashboard.userResource, dashboard.orgResource, dashboard.permissionsResource],
      {
        timeoutMs: 2500,
        signal: requestAbortSignal,
      }
    )
  } catch (err) {
    // При таймауте или обрыве соединения отдаём частичный снимок того, что уже успело загрузиться
    console.warn('[SSR] Partial hydration fallback:', err)
  }

  // 4. Возвращаем чистый JSON-снимок в шаблон / провайдер клиента
  return dashboard.exportSnapshot()
}
```

## Ключевые правила безопасного SSR

1. **Никогда не создавайте new ReactiveEngine() на верхнем уровне модуля** в серверном коде — только внутри функции обработки запроса или внутри компонента/провайдера рендера.
2. **Всегда ограничивайте ожидание через timeoutMs:** в SSR зависание одного второстепенного микросервиса не должно ронять отдачу всей HTML-страницы — перехватывайте таймаут и отдавайте частичный `exportSnapshot()`, чтобы клиент догрузил недостающий блок самостоятельно.
3. **Используйте computed для пре-валидации:** возврат null из промежуточного computed гарантирует, что зависимый resource не отправит бесполезный сетевой запрос и не потратит время рендера.
