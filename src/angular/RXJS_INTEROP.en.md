# 🚂 RxJS Interop: Integrating ReactiveEngine with Angular Streams

The `@pravosleva/reactive-engine/angular` package provides lightweight interop bridge utilities for seamless conversion between your core reactive primitives (`Signal`, `Computed`) and Angular's asynchronous **RxJS (`Observable`)** streams.

---

## 💡 Why Is This Needed?

* **Core Signals** — Perfect for synchronous **State Management**, computational caching (`computed`), and immediate, lag-free UI rendering.
* **RxJS Streams (`Observable`)** — Perfect for handling **Asynchronous Events**, declarative management of network requests, and WebSocket sessions using 100+ powerful operators (`debounceTime`, `switchMap`, `distinctUntilChanged`).

The interop bridge allows you to leverage the strengths of both reactive patterns within a single Angular 16+ application.

---

## 🛠️ Bridge API Utilities

1. **`coreToObservable(item)`** — Accepts a core `Signal` or `Computed` and transforms it into an RxJS `Observable`. The stream instantly emits (`next()`) the current value, and then broadcasts all subsequent updates.
2. **`coreFromObservable(source$, initialValue)`** — Accepts any RxJS `Observable` and wraps it into a reactive container that can be consumed directly by the `engine.use()` method inside your Angular components.

---

## 💻 Practical Examples

### 1. Smart Search Input with Debouncing (`coreToObservable`)

**Scenario:** A user quickly types text into a search bar. The raw input signal spams updates on every keystroke. We need to throttle this stream to `300ms`, drop duplicate values, trigger an asynchronous HTTP request to the API, and automatically cancel the previous request if the user continues typing (Race Condition Protection).

#### Angular Service Code (`search.service.ts`)
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReactiveEngine4Angular, coreToObservable } from '@pravosleva/reactive-engine/angular';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private http = inject(HttpClient);
  private engine = inject(ReactiveEngine4Angular);

  // 1. Create a raw input signal using the core reactive engine
  public searchSignal = this.engine.signal<string>('', 'search:input:query');

  // 2. Convert the core signal to an RxJS Observable to apply stream operators
  private query\$ = coreToObservable(this.searchSignal);

  // 3. Declaratively describe the network request processing pipeline
  public searchResults: Observable<any> = this.query\$.pipe(
    debounceTime(300),           // Throttles input spam to 300ms
    distinctUntilChanged(),      // Ignores if text didn't change (e.g., hitting Ctrl)
    switchMap((query) => {       // Automatically aborts previous XHR request on new input
      if (!query.trim()) return [[]];
      return this.http.get(`/api/search?q=${encodeURIComponent(query)}`);
    })
  );

  // UI Component action trigger
  public updateQuery(text: string): void {
    this.searchSignal.value = text;
  }
}
```

---

### 2. Streaming WebSocket Events into Reactive State (`coreFromObservable`)

**Scenario:** The application listens to a real-time stream of crypto price ticks or chat messages via a native WebSocket. We need to aggregate these asynchronous RxJS stream events into a core reactive container so that Angular components can consume it via standard Angular Signals.

#### Angular Component Code (`crypto-dashboard.component.ts`)
```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { webSocket } from 'rxjs/webSocket';
import { map } from 'rxjs/operators';
import { ReactiveEngine4Angular, coreFromObservable } from '@pravosleva/reactive-engine/angular';

@Component({
  selector: 'app-crypto-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <h3>📈 Current BTC/USDT Price</h3>
      <!-- Use standard Angular Signal execution syntax with parentheses () -->
      <code class="price-tag">\${{ btcPrice() }}</code>
    </div>
  `
})
export class CryptoDashboardComponent implements OnInit {
  private engine = inject(ReactiveEngine4Angular);

  // Create a cold RxJS Stream from WebSocket
  private ws\$ = webSocket<{ price: number }>('wss://://exchange.com');
  private priceStream = this.ws.pipe(map(res => res.price));

  // Angular Signal placeholder for the HTML template
  public btcPrice!: any;

  ngOnInit(): void {
    // 1. Wrap the RxJS Observable into the core reactive contract
    const corePriceItem = coreFromObservable(this.priceStream\$, 0.00);

    // 2. Process via the adapter .use() to get a readonly Angular Signal!
    // The DestroyRef lifecycle management inside the adapter automatically closes the WS stream upon component unmount.
    this.btcPrice = this.engine.use(corePriceItem);
  }
}
```

---

## 💎 Key Architectural Advantages

1. **Automatic Memory Management:** The `coreToObservable` utility produces streams that automatically trigger the core's `unsubscribe()` hook the moment the RxJS stream completes or when the final Angular component unsubscribes via the `async` pipe.
2. **Consistent Log Dashboard:** Since the bridge utilities use the core's original `.subscribe()` method under the hood, the `flushLogs` profiler automatically captures these actions under the correct framework badge: `angular:use:your-signal-name`, maintaining absolute transparency of the reactive graph.
3. **Seamless Platform Interop:** It effortlessly transforms heavy lazy computations (`computed`) into active push-based streams, resolving the "frozen Pull model" trap inside asynchronous Angular enterprise services.
