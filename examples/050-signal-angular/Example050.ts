import { Component } from '@angular/core'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular'

// 1. Описываем изолированную бизнес-логику (Ядро/Сервис) — код 1-в-1 как в React/Vue
class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'angular-example:counter')

  public inc = () => {
    this.counter.value += 1
  }
}

@Component({
  selector: 'app-counter-example',
  standalone: true,
  // В шаблоне Angular Signals вызываются как функции: counter()
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular 16+ Signal Example</div>
      <code>{{ counter() }}</code>
      <div class="catSection">
        <button (click)="logic.inc()" class="btn neonBtn neonBtn--primary neonBtn--outlined">
          INC (Angular)
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./ui.common.module.scss', './ui.button.module.scss'] // Ваши SCSS стили
})
export class AngularCounterComponent {
  // 2. Инициализируем Angular-версию движка
  private engine = new ReactiveEngine4Angular()

  // 3. Внедряем сервис из DI-контейнера
  public logic = this.engine.inject(CounterLogic)

  // 4. Превращаем сигнал ядра в нативный Angular Signal через метод .use()
  // Метод inject(DestroyRef) под капотом use() отработает корректно, так как мы находимся в фазе инициализации класса
  public counter = this.engine.use(this.logic.counter)
}
