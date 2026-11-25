# Lazy Service Injection (Lazy Dependency Injection)

In large applications, core services often depend on auxiliary modules that are only needed when a specific user action occurs: exporting a heavy Excel/PDF report, opening an advanced analytics panel, signing a document cryptographically, or handling rare fallback flows.

If you inject such a service via an eager class field (`private exporter = this.engine.inject(ReportExportService)`), it is instantiated—allocating its internal signals, effects, and caches—**immediately when the parent service is created**, even if the user never clicks the "Export" button.

In **`@pravosleva/reactive-engine` v3.0.x**, the DI container (`engine.inject(...)`) resolves lazily at call time and caches the created instance per `ReactiveEngine`. This lets you defer instantiating child services until the exact moment they are first accessed.

## Key Benefits of Lazy Injection

1. **Faster Cold Start:** Parent services initialize instantaneously without spending CPU or memory setting up rarely used child graphs, `computed` chains, or subscriptions.
2. **Lower Memory Footprint:** If a user never triggers the secondary feature during their session, its signals, `withCache` stores, and listeners are never allocated in memory.
3. **Breaking Circular Dependencies:** When `ServiceA` and `ServiceB` reference each other inside methods, lazy resolution via a getter or method call completely avoids infinite instantiation loops.
4. **Idempotent DI Caching:** Subsequent calls to `this.engine.inject(HeavyService)` never create duplicate instances—the engine returns the exact singleton cached on the first call.

## Practical Example: Orders Catalog & Lazy Report Exporter

### 1. Auxiliary Heavy Service (`ReportExportService.ts`)

```typescript
import { AbstractService, withCache } from '@pravosleva/reactive-engine'

export interface OrderRecord {
  id: string
  total: number
  createdAt: string
}

export class ReportExportService extends AbstractService {
  // Heavy internal state, caches, and counters are allocated only on first inject()
  public isExporting = this.engine.signal(false, 'export:isExporting')
  public exportedCount = this.engine.signal(0, 'export:count')

  private buildCsvCached = withCache<OrderRecord[], string>(
    async (orders) => {
      // Simulate CPU-intensive CSV/report generation
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

### 2. Parent Service with Lazy Injection (`OrdersCatalogService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReportExportService, type OrderRecord } from './ReportExportService.js'

export class OrdersCatalogService extends AbstractService {
  // Primary catalog state initializes immediately
  public orders = this.engine.signal<OrderRecord[]>([], 'orders:list')

  // Lazy getter: ReportExportService is NOT instantiated when OrdersCatalogService starts.
  // It is created only on the first access to `this.exporter`, and every subsequent
  // access returns the cached singleton from the engine's DI container.
  public get exporter(): ReportExportService {
    return this.engine.inject(ReportExportService)
  }

  public addOrder(order: OrderRecord) {
    this.orders.value = [...this.orders.value, order]
  }

  /**
   * Secondary flow: until this method is called, ReportExportService
   * consumes zero memory and registers no nodes in the reactive graph.
   */
  public async downloadOrdersReport(): Promise<string> {
    return this.exporter.generateCsv(this.orders.value)
  }
}
```

## Comparison: Eager vs. Lazy Dependency Injection

| Criterion | Eager DI (Class Field) | Lazy DI (Getter or Method Call) |
| :--- | :--- | :--- |
| **Syntax** | `private child = this.engine.inject(ChildService)` | `get child() { return this.engine.inject(ChildService) }` |
| **Instantiation timing** | Immediately when parent is first injected | On first getter access or method invocation |
| **Startup memory cost** | Allocated upfront for the entire dependency chain | Zero for unused feature branches |
| **Circular dependencies (`A <-> B`)** | Can trigger infinite recursion during construction | Safe when resolved inside methods |
| **Best suited for** | Core dependencies needed immediately (API client, Auth) | On-demand modules (export, printing, analytics, modal managers) |

### 3. Application Usage

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { OrdersCatalogService } from './OrdersCatalogService.js'

const engine = new ReactiveEngine()

// 1. Instantiate only the parent service.
// ReportExportService has NOT been allocated in memory yet.
const catalog = engine.inject(OrdersCatalogService)

catalog.addOrder({ id: 'ORD-101', total: 2500, createdAt: '2026-11-18' })
catalog.addOrder({ id: 'ORD-102', total: 4800, createdAt: '2026-11-18' })

// 2. The user clicks "Download CSV":
// this triggers the lazy inject(ReportExportService) and generates the report
const csvContent = await catalog.downloadOrdersReport()
console.log(csvContent)

// 3. Subsequent calls reuse the DI-cached instance along with its internal withCache store
const cachedCsv = await catalog.downloadOrdersReport()
console.log(cachedCsv)
```

## Advanced Pattern: Lazy DI + Dynamic `import()` (Code Splitting)

If the child service pulls in heavy third-party dependencies (such as a PDF generator or spreadsheet parser), combine lazy injection with dynamic `import()` so the module bundle is fetched over the network strictly on demand:

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'
import type { OrderRecord } from './ReportExportService.js'

export class OrdersWithCodeSplitService extends AbstractService {
  public orders = this.engine.signal<OrderRecord[]>([], 'orders:splitList')

  public async downloadOrdersReport(): Promise<string> {
    // 1. Load the service JS chunk only on the first export click
    const { ReportExportService } = await import('./ReportExportService.js')

    // 2. Register/resolve it inside the current engine's DI container
    const exporter = this.engine.inject(ReportExportService)

    return exporter.generateCsv(this.orders.value)
  }
}
```

## Production Best Practices

* **Use a `get service()` getter when multiple methods share the lazy dependency:** A getter eliminates repeating `this.engine.inject(ChildService)` across parent methods while still deferring instantiation until the first explicit property access.
* **Do not read a lazy getter inside eager `computed` or `effect` blocks:** Reading `this.exporter.isExporting.value` inside an `engine.effect()` that runs immediately upon parent creation defeats laziness and instantiates the child service right away.
* **Preserve per-`ReactiveEngine` isolation:** Because `this.engine.inject(...)` is scoped to the current `this.engine` instance, lazily resolved child services automatically inherit the parent's isolation boundary (including per-request SSR and unit tests).
