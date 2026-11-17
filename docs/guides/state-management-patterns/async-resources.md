# Асинхронные ресурсы и защита от гонок запросов (`resource`)

В **`@pravosleva/reactive-engine` v3.0.1** работа с сетевыми запросами вынесена в специализированный декларативный примитив **`engine.resource()`**. Он избавляет от ручного управления флагами `isLoading`, создания `AbortController` и написания эффектов для перезапуска запросов при изменении параметров.

## Как устроен `engine.resource()` под капотом

Примитив `resource` объединяет реактивный граф зависимостей с жизненным циклом асинхронной операции:

1. **Автоматический перезапуск:** Ресурс принимает источник зависимостей (`source` — отдельный `signal` или `computed`) и автоматически перезапускает `fetcher` при каждом изменении этого источника.
2. **Подавление Race Conditions:** При каждом новом запуске движок автоматически вызывает `abort()` у `AbortController` предыдущего незавершённого запроса, передавая актуальный `abortSignal` вторым аргументом в `fetcher`.
3. **Предварительная проверка (`validateBeforeFetch`):** Позволяет отсечь заведомо невалидные запросы (например, слишком короткую поисковую строку) ещё до обращения к сети.
4. **Валидация ответа (`responseValidate`):** Проверяет структуру полученных данных перед тем, как сохранить их в `data` и сбросить статус ошибки.

## Практический пример: Поиск с пагинацией и валидацией

### 1. Описание сервиса (`SearchService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

interface UserItem {
  id: number
  name: string
}

interface SearchResponse {
  ok: boolean
  items: UserItem[]
}

export class SearchService extends AbstractService {
  public query = this.engine.signal('', 'search:query')
  public page = this.engine.signal(1, 'search:page')

  // Объединяем параметры в один вычисляемый источник
  private requestDeps = this.engine.computed(
    () => ({
      q: this.query.value.trim(),
      page: this.page.value,
    }),
    'search:deps'
  )

  public usersResource = this.engine.resource<SearchResponse, { q: string; page: number }>(
    async ({ q, page }, abortSignal) => {
      const params = new URLSearchParams({ q, page: String(page) })
      const res = await fetch(`/api/users?${params}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ошибка: ${res.status}`)
      }

      return res.json()
    },
        this.requestDeps,
    {
      name: 'search:usersResource',
      // Блокируем запрос до выхода в сеть, если введено меньше 2 символов
      validateBeforeFetch: ({ q }) => q.length >= 2 || 'Введите минимум 2 символа',
      // Проверяем структуру ответа сервера перед сохранением в data
      responseValidate: (data) => {
        if (!data || data.ok !== true || !Array.isArray(data.items)) {
          throw new Error('Некорректный формат ответа сервера')
        }
        return true
      },
    }
  )

    public setQuery(newQuery: string) {
    this.query.value = newQuery
    this.page.value = 1
  }

  public setPage(newPage: number) {
    this.page.value = newPage
  }
}
```

### 2. Использование сервиса и подписка на состояние

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { SearchService } from './SearchService.js'

const engine = new ReactiveEngine()
const searchService = engine.inject(SearchService)

// Подписываемся на состояние ресурса
engine.effect(() => {
  const { loading, data, error } = searchService.usersResource.value

  if (loading) {
    console.log('Загрузка пользователей...')
    return
  }

  if (error) {
    console.warn('Статус / ошибка:', error.message)
    return
  }

  if (data) {
    console.log('Найдено записей:', data.items.length)
  }
})

// 1. Сработает validateBeforeFetch -> сетевой запрос не уйдёт
searchService.setQuery('a')

// 2. Запустится первый GET-запрос (/api/users?q=react&page=1)
searchService.setQuery('react')

// 3. Предыдущий запрос мгновенно отменится через AbortController,
// и сразу запустится актуальный (/api/users?q=reactive&page=1)
searchService.setQuery('reactive')
```

## Ручное управление ресурсом

Помимо автоматической реакции на изменение зависимостей, у экземпляра `resource` есть методы императивного управления:

* **`resource.refresh()`** — принудительно перезапускает текущий запрос с актуальными параметрами (например, по кнопке «Обновить»).
* **`resource.abort()`** — вручную прерывает активный сетевой запрос через `AbortController` без изменения исходных сигналов.

::: tip Обработка отменённых запросов
Когда движок отменяет устаревший запрос из-за изменения `source`, браузерный `fetch` выбрасывает `DOMException` с именем `'AbortError'`. Встроенный `resource` автоматически распознаёт `AbortError` и **не записывает его в поле `error`**, сохраняя интерфейс от ложных сообщений об ошибках.
:::
