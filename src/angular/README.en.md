# Integrating Core Services with Angular 16+

The `@pravosleva/reactive-engine/angular` sub-package provides a seamless, robust integration of your polymorphic core services with native **Angular Signals** (available since Angular 16).

The `ReactiveEngine` class from the `/angular` directory extends your core state machine and maps engine signals into standard, read-only Angular signals. It completely automates subscription lifecycle management using the `DestroyRef` token, protecting your enterprise applications from memory leaks out of the box.

### Architectural Rules & Injection Context

Automated cleanup in Angular strictly depends on the framework's dependency injection system via `inject(DestroyRef)`. Because of this constraint, invoking the `.use()` method must happen in specific framework-compliant lifecycles:

1. **Automated Context (Recommended)**: Invoke `.use()` directly during class property initialization or within the class `constructor`. At this point, Angular maintains an active injection context and will seamlessly bind the teardown mechanism to the lifecycle of that specific instance.
2. **Explicit Context (For Lazy or Asynchronous Blocks)**: If you need to subscribe to a signal inside a lifecycle hook like `ngOnInit`, custom helper methods, or an asynchronous promise chain, Angular's default injection context is lost. In these scenarios, you **must** pass the current `Injector` manually through `options.injector`.

> ⚠️ **Warning:** Calling `.use()` outside an injection context without providing an explicit injector will cause Angular to immediately throw an `NG0203` exception. This fail-fast design is intentional to prevent silent memory leaks at runtime.

### Basic Component Example (Angular Standalone Pattern)

Below is a complete implementation demonstrating how to wire your framework-agnostic JavaScript business logic into an Angular template:

```typescript
import { Component, inject, Injector, OnInit, type Signal } from '@angular/core';
import { AbstractService } from '@pravosleva/reactive-engine';
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular';

// 1. Define pure business logic (Core/Service) — 100% agnostic to UI frameworks
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example:angular:counter');

  public inc = () => {
    this.counter.value += 1;
  };
}

@Component({
  selector: 'app-counter-example',
  standalone: true,
  // Inside templates, Angular Signals are always evaluated as functions with parentheses: counter()
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular Reactive Engine Example</div>
      <code>{{ counter() }}</code>
      <code>Lazy Signal: {{ asyncCounter() }}</code>
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
  // Initialize the Angular-specific engine instance
  private engine = new ReactiveEngine4Angular();

  // Inject the service from the engine DI container
  public logic = this.engine.inject(CounterLogic);

  // Scenario 1: Automated Injection Context (Class property initialization)
  // The method successfully resolves inject(DestroyRef) under the hood
  public counter = this.engine.use(this.logic.counter);

  // Inject the framework's native Injector for lazy/deferred subscriptions
  private injector = inject(Injector);
  public asyncCounter!: Signal<number>;

  ngOnInit() {
    // Scenario 2: Explicit Injection Context (Inside lifecycle hooks)
    // Always provide the explicit injector option to prevent runtime context crashes
    this.asyncCounter = this.engine.use(this.logic.counter, {
      injector: this.injector
    });
  }
}
```

### Architectural Key Benefits:
* **OnPush Change Detection Strategy Compatible**: Because `.use()` evaluates to a native `Signal<T>`, your components can fully utilize `ChangeDetectionStrategy.OnPush` or run completely **Zoneless** for unmatched rendering performance.
* **Full Reactive Graph Interoperability**: The resulting signal integrates flawlessly with native Angular reactivity, enabling you to derive values using framework-level `computed(() => ...)` or run isolated side effects with `effect(() => ...)`.
* **Zero UI-Framework Boilerplate**: Your `CounterLogic` service class remains completely pure, independent of RxJS streams, zone triggers, or Angular decorators. This ensures your exact business logic can be shared between React, Vue 3, and Angular without rewrites.

## Angular Version Support Analysis
The developed adapter ReactiveEngine4Angular officially supports **Angular 16 and all subsequent versions (including Angular 17, 18, 19, 20, and newer)**.
The lower and upper bounds of this compatibility matrix are determined by the following core architectural requirements:
- **Introduction of Angular Signals**: The `.use()` method converts your polymorphic core library signals into native Angular signals using the `signal()` primitive. This reactivity model was first introduced by Google in the Angular 16 release.
- **Adoption of `DestroyRef`**: Our automated cleanup mechanism to prevent memory leaks relies on the `inject(DestroyRef)` token. This came as a modern replacement for the old OnDestroy interface in Angular 16, allowing developers to register cleanup callbacks directly inside standalone functions, constructors, or base utility classes without bloating the UI component's boilerplate code.
- `Zoneless Support (Angular 17+)`: In subsequent versions, Angular Signals transitioned from Developer Preview to a stable production runtime, eventually becoming the cornerstone of **Zoneless Angular (Angular 18+)**. Because our adapter communicates with Angular purely via public reactive primitives (`signal()`, `inject()`, and `DestroyRef`), it is inherently compatible with modern Zoneless architectures and completely safe from breaking changes in internal JIT compilation processes.
