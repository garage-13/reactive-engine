# Стратегии кэширования запросов (`withCache` и `withStaleWhileRevalidate`)

В продакшн-приложениях одни и те же справочники, профили пользователей или результаты фильтров часто запрашиваются повторно при навигации или из нескольких независимых виджетов одновременно.

В **`@pravosleva/reactive-engine` v3.0.x** эту задачу решают два композируемых декоратора над `fetcher`, которые нативно встраиваются в `engine.resource()` и поддерживают отмену через `AbortSignal`:

* **`withCache`** — стратегия **Cache-First с TTL и склеиванием запросов (Request Collapsing)**. Пока запись свежая, сетевой запрос вообще не уходит. Если несколько потребителей одновременно запрашивают один ключ, в сеть уходит только один запрос, а остальные получают результат из общего `Promise`.
* **`withStaleWhileRevalidate`** — стратегия **Network-First с отказоустойчивым фолбэком и LRU-памятью (`maxSize`)**. Всегда пытается получить свежие данные из сети, но при сбое или отмене запроса возвращает валидный кэш, не роняя интерфейс.

## Стратегия 1: Кэширование с TTL и Request Collapsing (`withCache`)

Идеально подходит для справочников, профилей и тяжёлых отчётов, которые не меняются каждую секунду.

### Описание сервиса (`CatalogService.ts`)

```typescript
import { AbstractService, withCache } from '@pravosleva/reactive-engine'

export interface ProductItem {
  id: string
  title: string
  price: number
}

interface CatalogQuery {
  category: string
  currency: 'RUB' | 'USD'
}

export class CatalogService extends AbstractService {
  public category = this.engine.signal('laptops', 'catalog:category')
  public currency = this.engine.signal<'RUB' | 'USD'>('RUB', 'catalog:currency')

  // Ключ кэша автоматически сериализуется через JSON.stringify(source)
  private queryParams = this.engine.computed<CatalogQuery>(
    () => ({
      category: this.category.value,
      currency: this.currency.value,
    }),
    'catalog:query'
  )

  // Оборачиваем fetcher: кэш живёт 60 секунд, параллельные дубли склеиваются
  private cachedFetchProducts = withCache<CatalogQuery, ProductItem[]>(
    async ({ category, currency }, abortSignal) => {
      const params = new URLSearchParams({ category, currency })
      const res = await fetch(`/api/products?${params}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка загрузки каталога: ${res.status}`)
      }

      return res.json()
    },
    { ttl: 60 * 1000 }
  )

  public productsResource = this.engine.resource(
    this.cachedFetchProducts,
    this.queryParams,
    'catalog:productsResource'
  )
}
```

## Стратегия 2: Отказоустойчивый кэш и LRU-память (`withStaleWhileRevalidate`)

В отличие от `withCache`, декоратор `withStaleWhileRevalidate` при каждом обращении старается забрать с сервера самые свежие данные, но если сеть нестабильна, сервер вернул ошибку или запрос был отменён — он подстраховывает UI, возвращая последнюю валидную запись из кэша.

Кроме того, опция `maxSize` превращает внутренний `Map` в **LRU-кэш (Least Recently Used)**: при достижении лимита автоматически вытесняется самый давно не запрашиваемый ключ.

### Описание сервиса (`WeatherOrRatesService.ts`)

```typescript
import {
  AbstractService,
  withStaleWhileRevalidate,
} from '@pravosleva/reactive-engine'

interface ExchangeRate {
  pair: string
  rate: number
  updatedAt: string
}

export class RatesService extends AbstractService {
  public currencyPair = this.engine.signal('USD/RUB', 'rates:pair')

  // Храним в памяти не более 20 последних валютных пар,
  // валидность резервного кэша — 10 минут
  private resilientFetcher = withStaleWhileRevalidate<string, ExchangeRate>(
    async (pair, abortSignal) => {
      const res = await fetch(`/api/rates?pair=${encodeURIComponent(pair)}`, {
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Сбой шлюза котировок: ${res.status}`)
      }

      return res.json()
    },
    {
      ttl: 10 * 60 * 1000,
      maxSize: 20,
      isLogsEnabled: true,
    }
  )

  public rateResource = this.engine.resource(
    this.resilientFetcher,
    this.currencyPair,
    'rates:resource'
  )
}
```

## Какой декоратор выбрать?

| Критерий | `withCache` | `withStaleWhileRevalidate` |
| :--- | :--- | :--- |
| **Приоритет при свежем кэше** | **Cache-First** (сеть не дёргается до истечения `ttl`) | **Network-First** (всегда запрашивает свежие данные с сервера) |
| **Склеивание параллельных запросов** | **Да** (`activePromises` отдаёт общий `Promise`) | Нет (каждый вызов идёт в сеть) |
| **Поведение при ошибке сети** | Пробрасывает ошибку в `resource.value.error` | **Отдаёт кэш**, если запись не старше `ttl` |
| **Ограничение памяти (LRU)** | Без лимита (очистка по `ttl` при обращении) | **Встроенный LRU** через опцию `maxSize` |
| **Лучший сценарий** | Справочники, профили, пагинация, защита от спама одинаковыми запросами | Котировки, живые дашборды, нестабильный мобильный интернет |

## Важные детали реализации

* **Детерминированный ключ через `JSON.stringify`:** Оба декоратора вычисляют ключ кэша на основе значения `source` (для объектов и массивов вызывается `JSON.stringify(source)`). Если вы передаёте в `resource` реактивный Proxy-массив или объект (`engine.reactive(...)`), любая его мутация автоматически изменит сериализованный ключ и приведёт к промаху кэша (cache miss) с загрузкой актуальных данных.
* **Изоляция кэша на уровне экземпляра декоратора:** Внутренний `Map` создаётся в замыкании при вызове `withCache(...)` или `withStaleWhileRevalidate(...)`. Если создавать обёрнутый `fetcher` как поле класса `AbstractService`, каждый инстанс `ReactiveEngine` получит свой изолированный кэш, что исключает утечку данных между пользователями при SSR.
