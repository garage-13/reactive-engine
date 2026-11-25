# Ленивое подключение сервисов (Lazy Dependency Injection)

В крупных приложениях сервисы часто имеют вспомогательные модули, которые требуются только при наступлении определённого события: экспорт тяжёлого отчёта в Excel/PDF, открытие модуля расширенной аналитики, криптографическая подпись документа или обработка ошибок в редком сценарии.

Если внедрять такой сервис через обычное поле класса (`private exporter = this.engine.inject(ReportExportService)`), он будет инстанцирован, инициализирует свои внутренние сигналы, эффекты и кэши **мгновенно в момент создания родительского сервиса** — даже если пользователь ни разу не нажмёт кнопку «Экспортировать».

В **`@pravosleva/reactive-engine` v3.0.x** контейнер DI (`engine.inject(...)`) работает лениво на уровне вызова и кэширует созданный экземпляр внутри текущего `ReactiveEngine`. Это позволяет отложить создание дочернего сервиса до момента первого реального обращения к нему.

## В чём выгода ленивого подключения?

1. **Ускорение холодного старта (Cold Start):** Родительский сервис создаётся мгновенно, не тратя CPU и память на инициализацию редко используемых дочерних графов, `computed`-цепочек и подписок.
2. **Экономия оперативной памяти:** Если пользователь за всю сессию не обратился к функциональности второго сервиса, его сигналы, кэши (`withCache`) и фоновые слушатели вообще не выделяются в памяти.
3. **Разрыв циклических зависимостей (Circular Dependencies):** Если `ServiceA` и `ServiceB` ссылаются друг на друга в отдельных методах, ленивое получение через геттер или внутри метода полностью устраняет ошибку инициализации при создании экземпляров.
4. **Идемпотентное кэширование в DI:** Повторные вызовы `this.engine.inject(HeavyService)` не создают дубликатов — движок возвращает уже созданный при первом обращении экземпляр.

## Практический пример: Каталог заказов и ленивый сервис экспорта отчётов

### 1. Вспомогательный тяжёлый сервис (`ReportExportService.ts`)

```typescript
import { AbstractService, withCache } from '@pravosleva/reactive-engine'

export interface OrderRecord {
  id: string
  total: number
  createdAt: string
}

export class ReportExportService extends AbstractService {
  // Тяжёлые внутренние состояния, кэши и счётчики создаются только при первом inject()
  public isExporting = this.engine.signal(false, 'export:isExporting')
  public exportedCount = this.engine.signal(0, 'export:count')

  private buildCsvCached = withCache<OrderRecord[], string>(
    async (orders) => {
      // Имитация ресурсоёмкой генерации CSV/отчёта
      const header = 'ID,Total,CreatedAt'
      const rows = orders.map((o) => `${o.id},${o.total},${o.createdAt}`)
      return [header, ...rows].join('\n')
    },
    { ttl: 30_000 }
  )

  public async generateCsv(orders: OrderRecord[]): Promise<string> {
    this.isExporting.value = true
    try {
      const csv = await this.buildCsvCached(orders, new AbortController().signal)
      this.exportedCount.value += 1
      return csv
    } finally {
      this.isExporting.value = false
    }
  }
}
```

### 2. Родительский сервис с ленивым внедрением (`OrdersCatalogService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReportExportService, type OrderRecord } from './ReportExportService.js'

export class OrdersCatalogService extends AbstractService {
  // Основное состояние каталога инициализируется сразу
  public orders = this.engine.signal<OrderRecord[]>([], 'orders:list')

  // Ленивый геттер: ReportExportService НЕ создаётся при старте OrdersCatalogService.
  // Экземпляр будет создан только при первом обращении к this.exporter,
  // а все последующие обращения вернут закэшированный синглтон из DI-контейнера ядра.
  public get exporter(): ReportExportService {
    return this.engine.inject(ReportExportService)
  }

  public addOrder(order: OrderRecord) {
    this.orders.value = [...this.orders.value, order]
  }

  /**
   * Вспомогательный сценарий: до вызова этого метода ReportExportService
   * вообще не занимает память и не регистрирует свои сигналы в графе.
   */
  public async downloadOrdersReport(): Promise<string> {
    return this.exporter.generateCsv(this.orders.value)
  }
}
```

## Сравнение: Обычное (Eager) и Ленивое (Lazy) внедрение

| Критерий | Eager DI (поле класса) | Lazy DI (геттер или вызов в методе) |
| :--- | :--- | :--- |
| **Синтаксис** | `private child = this.engine.inject(ChildService)` | `get child() { return this.engine.inject(ChildService) }` |
| **Момент создания экземпляра** | Мгновенно при первом `inject()` родителя | При первом обращении к геттеру или вызове метода |
| **Потребление памяти на старте** | Выделяется сразу для всей цепочки зависимостей | Нулевое для неиспользуемых веток функциональности |
| **Циклические зависимости (`A <-> B`)** | Могут вызвать бесконечную рекурсию при создании | Полностью безопасны при обращении внутри методов |
| **Когда использовать** | Базовые зависимости, нужные с первой миллисекунды (API-клиент, Auth) | Редко вызываемые модули (экспорт, печать, аналитика, модал-менеджеры) |

### 3. Использование в коде приложения

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { OrdersCatalogService } from './OrdersCatalogService.js'

const engine = new ReactiveEngine()

// 1. Создаём только родительский сервис.
// ReportExportService на этом этапе ещё НЕ создан в памяти.
const catalog = engine.inject(OrdersCatalogService)

catalog.addOrder({ id: 'ORD-101', total: 2500, createdAt: '2026-11-18' })
catalog.addOrder({ id: 'ORD-102', total: 4800, createdAt: '2026-11-18' })

// 2. Пользователь нажимает кнопку «Скачать CSV»:
// именно сейчас произойдёт ленивый inject(ReportExportService) и генерация отчёта
const csvContent = await catalog.downloadOrdersReport()
console.log(csvContent)

// 3. Повторный вызов возьмёт уже созданный и закэшированный в DI экземпляр
// вместе с его внутренним кэшем withCache
const cachedCsv = await catalog.downloadOrdersReport()
console.log(cachedCsv)
```

## Продвинутый приём: Ленивый DI + динамический `import()` (Code Splitting)

Если дочерний сервис тянет за собой тяжёлые внешние библиотеки (например, генератор PDF или парсер таблиц), ленивое внедрение можно объединить с асинхронным `import()`, чтобы сам код сервиса загружался по сети только по требованию:

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import type { OrderRecord } from './ReportExportService.js'

export class OrdersWithCodeSplitService extends AbstractService {
  public orders = this.engine.signal<OrderRecord[]>([], 'orders:splitList')

  public async downloadOrdersReport(): Promise<string> {
    // 1. Загружаем JS-чанк сервиса только при первом клике на экспорт
    const { ReportExportService } = await import('./ReportExportService.js')

    // 2. Регистрируем/получаем его в DI-контейнере текущего движка
    const exporter = this.engine.inject(ReportExportService)

    return exporter.generateCsv(this.orders.value)
  }
}
```

## Рекомендации для продакшена

* **Используйте геттер `get service()`, если дочерний сервис нужен в нескольких методах:** Геттер избавляет от дублирования `this.engine.inject(ChildService)` в каждом методе родителя, но при этом не выполняется до первого явного обращения к `this.service`.
* **Не обращайтесь к ленивому геттеру внутри `computed` или `effect`, запускаемых при старте:** Если вы прочитаете `this.exporter.isExporting.value` внутри `engine.effect()`, который срабатывает сразу при создании родителя, ленивость исчезнет — дочерний сервис создастся в ту же миллисекунду.
* **Сохраняйте изоляцию по инстансу `ReactiveEngine`:** Поскольку `this.engine.inject(...)` привязан к конкретному экземпляру `this.engine`, лениво созданный дочерний сервис автоматически наследует изоляцию родителя (включая SSR-запросы и юнит-тесты).
