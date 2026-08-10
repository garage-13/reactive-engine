# 🚂 RxJS Interop: Интеграция ReactiveEngine с потоками Angular

Пакет `@pravosleva/reactive-engine/angular` предоставляет легковесные утилиты-мосты для бесшовной конвертации между реактивными примитивами вашего ядра (`Signal`, `Computed`) и асинхронными потоками **RxJS (`Observable`)**.

## 💡 Зачем это нужно?

* **Сигналы ядра** — Идеальны для синхронного управления **состоянием (State)**, кэширования вычислений и мгновенной отрисовки UI без лагов.
* **RxJS Потоки (`Observable`)** — Идеальны для обработки **асинхронных событий (Events)**, декларативного управления сетевыми запросами и WebSocket-сессиями с использованием 100+ мощных операторов (`debounceTime`, `switchMap`, `distinctUntilChanged`).

Использование interop-моста позволяет задействовать сильные стороны обоих подходов в рамках одного Angular 16+ приложения.

## 🛠️ API утилит

1. **`coreToObservable(item)`** — Принимает `Signal` или `Computed` ядра и превращает его в RxJS `Observable`. Поток мгновенно испускает (`next()`) текущее значение, а затем транслирует все последующие изменения.
2. **`coreFromObservable(source$, initialValue)`** — Принимает любой RxJS `Observable` и оборачивает его в реактивный контейнер, который можно напрямую передавать в метод `engine.use()` внутри Angular-компонентов.

## 💻 Практические примеры

### 1. Умный поиск с защитой от дребезга (`coreToObservable`)

**Сценарий:** Пользователь быстро вводит текст в поисковую строку. Сырой сигнал ввода спамит на каждую нажатую клавишу. Нам необходимо зажать этот поток на `300 мс`, отсечь дубликаты, выполнить асинхронный HTTP-запрос к API и автоматически отменить предыдущий запрос, если пользователь продолжил ввод (Race Condition Protection).

#### Код Angular-сервиса логики (`search.service.ts`)
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

  // 1. Создаем сырой сигнал ввода средствами реактивного ядра
  public searchSignal = this.engine.signal<string>('', 'search:input:query');

  // 2. Конвертируем сигнал ядра в RxJS поток для применения операторов
  private query\$ = coreToObservable(this.searchSignal);

  // 3. Декларативно описываем пайплайн обработки сетевого запроса
  public searchResults: Observable<any> = this.query.pipe(
    debounceTime(300),           // Зажимаем спам ввода на 300мс
    distinctUntilChanged(),      // Игнорируем, если текст не изменился (например, нажатие Ctrl)
    switchMap((query) => {       // Автоматически отменяет прошлый XHR-запрос при новом вводе
      if (!query.trim()) return [[]];
      return this.http.get(`/api/search?q=${encodeURIComponent(query)}`);
    })
  );

  // Экшен для UI-компонента
  public updateQuery(text: string): void {
    this.searchSignal.value = text;
  }
}
```

### 2. Трансляция WebSocket-событий в реактивный стейт (`coreFromObservable`)

**Сценарий:** Приложение слушает поток биржевых котировок или сообщений чата через нативный WebSocket. Нам необходимо агрегировать эти асинхронные события из RxJS-потока в реактивный контейнер ядра, чтобы Angular-компоненты могли подписаться на него через стандартные Angular-сигналы.

#### Код Angular-компонента (`crypto-dashboard.component.ts`)
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
      <h3>📈 Текущий курс BTC/USDT</h3>
      <!-- Используем стандартный синтаксис Angular сигналов со скобками () -->
      <code class="price-tag">\${{ btcPrice() }}</code>
    </div>
  `
})
export class CryptoDashboardComponent implements OnInit {
  private engine = inject(ReactiveEngine4Angular);

  // Создаем холодный RxJS поток из WebSocket
  private ws\$ = webSocket<{ price: number }>('wss://://exchange.com');
  private priceStream = this.ws.pipe(map(res => res.price));

  // Angular Signal для использования в HTML шаблоне
  public btcPrice!: any;

  ngOnInit(): void {
    // 1. Оборачиваем RxJS поток в контракт реактивного ядра
    const corePriceItem = coreFromObservable(this.priceStream\$, 0.00);

    // 2. Пропускаем через адаптерuse() и получаем readonly Angular Signal!
    // Менеджмент памяти DestroyRef внутри адаптера автоматически закроет WS-соединение при unmount.
    this.btcPrice = this.engine.use(corePriceItem);
  }
}
```

## 💎 Преимущества утилит-мостов

1. **Защита от утечек памяти:** Метод `coreToObservable` генерирует поток, который автоматически вызывает деструктор `unsubscribe()` вашего ядра в момент, когда RxJS-поток завершает работу (`complete`) или от него отписывается финальный Angular-компонент через `async`-пайп.
2. **Консистентность логирования:** Так как утилиты под капотом используют оригинальный метод `.subscribe()` элементов ядра, подсистема `flushLogs` зафиксирует эти операции под правильным системным бэджем: `angular:use:your-signal-name`, сохраняя прозрачность графа транзакций.
3. **Совместимость с архитектурой Angular (Signals + RxJS):** Позволяет плавно переводить тяжелые ленивые вычисления (`computed`) в реактивные Push-потоки, решая проблему замерзания Pull-модели в Angular-сервисах.
