# Использование Core-сервисов в Angular-окружении (Angular 16+)

Пакет `@pravosleva/reactive-engine/angular` предоставляет бесшовную интеграцию полиморфных Core-сервисов вашего приложения с нативными **Angular Signals** (доступно в Angular 16+).

Класс `ReactiveEngine` из подпакета `/angular` расширяет базовое ядро и преобразует сигналы движка в сигналы Angular с автоматическим управлением жизненным циклом подписок (`DestroyRef`), полностью защищая приложение от утечек памяти.

### Основные правила и Injection Context

Функция автоматической очистки памяти в Angular опирается на механизм `inject(DestroyRef)`. В связи с этим вызов метода `engine.use()` должен происходить в строго определенных фреймворком местах:

1. **Автоматический контекст (Рекомендуемый)**: Вызывайте `.use()` на этапе инициализации полей класса компонента/сервиса или прямо внутри их `constructor`. В этот момент Angular находится в активном контексте инъекций и автоматически привяжет очистку к жизненному циклу инстанса.
2. **Явный контекст (Для асинхронного или ленивого кода)**: Если вам необходимо подписаться на сигнал внутри кастомного метода, хука `ngOnInit` или асинхронного промиса, Angular теряет контекст инъекций. В этом случае вы **обязаны** передать текущий `Injector` приложения вторым аргументом в `options.injector`.

> ⚠️ **Важно:** Вызов метода `.use()` вне контекста инъекций и без передачи явного инжектора приведет к немедленному выбросу исключения (ошибка Angular `NG0203`). Это сделано намеренно для предотвращения «тихих» утечек памяти в рантайме.

### Пример реализации компонента (Angular 16+ Standalone)

Ниже представлен пример интеграции чистой бизнес-логики счетчика в компонент Angular:

```typescript
import { Component, inject, Injector, OnInit, signal, type Signal } from '@angular/core';
import { AbstractService } from '@pravosleva/reactive-engine';
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular';

// 1. Описываем изолированную бизнес-логику (Ядро/Сервис), независимую от UI фреймворков
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example:angular:counter');

  public inc = () => {
    this.counter.value += 1;
  };
}

@Component({
  selector: 'app-counter-example',
  standalone: true,
  // В шаблонах Angular Signals вызываются как функции со скобками: counter()
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular Reactive Engine Example</div>
      <code>{{ counter() }}</code>
      <code>Ленивый сигнал: {{ asyncCounter() }}</code>
      <div class="catSection">
        <button (click)="logic.inc()" class="btn neonBtn neonBtn--primary">
          INC
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./ui.common.module.scss']
})
export class AngularCounterComponent implements OnInit {
  // Инициализируем Angular-версию движка
  private engine = new ReactiveEngine4Angular();

  // Внедряем сервис из DI-контейнера движка
  public logic = this.engine.inject(CounterLogic);

  // Сценарий 1: Автоматический контекст (Инициализация полей класса)
  // Метод под капотом успешно вызовет inject(DestroyRef)
  public counter = this.engine.use(this.logic.counter);

  // Внедряем нативный инжектор Angular для ленивых подписок
  private injector = inject(Injector);
  public asyncCounter!: Signal<number>;

  ngOnInit() {
    // Сценарий 2: Ленивый контекст (Внутри хуков жизненного цикла Angular)
    // Обязательно передаем { injector }, чтобы избежать утечек памяти и ошибок рантайма
    this.asyncCounter = this.engine.use(this.logic.counter, {
      injector: this.injector
    });
  }
}
```

### Архитектурные преимущества интеграции:
* **Стратегия Change Detection**: Метод `.use()` возвращает стандартный `Signal<T>`. Это позволяет без ограничений включать в компонентах Angular оптимизированную стратегию `ChangeDetectionStrategy.OnPush`.
* **Совместимость с Reactive Graph**: Полученный сигнал Angular можно без проблем комбинировать со встроенными утилитами Angular — вычисляемыми сигналами `computed(() => ...)` и сайд-эффектами `effect(() => ...)`.
* **Zero-Framework Бизнес-логика**: Класс `CounterLogic` остается абсолютно чистым от рантайма Angular, RxJS потоков и декораторов, что позволяет переиспользовать его исходный код между React, Vue 3 и Angular проектами без изменений.

## Почему именно с Angular 16?
- Появление Angular Signals: Метод `.use()` внутри адаптера под капотом создаёт нативный сигнал Angular через функцию `signal()`. Этот реактивный примитив и сама концепция сигналов были впервые представлены разработчиками Google именно в релизе Angular 16.
- Внедрение `DestroyRef`: Наш механизм автоматического предотвращения утечек памяти использует хук `inject(DestroyRef)`. Этот токен пришёл на смену устаревшему интерфейсу OnDestroy и появился также в Angular 16, позволив регистрировать функции очистки прямо внутри функций и базовых классов, а не только в методах компонентов.

## Как обстоят дела с версиями 17+ и выше?
- Полная совместимость: В версиях Angular 17, 18 и 19 концепция сигналов перешла из статуса Developer Preview в стабильный продакшн-рантайм (Stable API Framework), а в версиях 20+ стала основным стандартом детекции изменений (Zoneless Angular).
- Поскольку наш адаптер общается с Angular исключительно через публичные контракты `signal()`, `inject()` и `DestroyRef`, он полностью защищён от ломающих изменений (Breaking Changes) внутренних JIT-компиляторов Ivy.
