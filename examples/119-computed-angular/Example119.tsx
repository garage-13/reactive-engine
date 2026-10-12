import { Component } from '@angular/core'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular'

// 1. Изолированная бизнес-логика: фильтрация и форматирование данных
class FilterLogic extends AbstractService {
  public search = this.engine.signal<string>('', 'angular-example:search')
  public items = this.engine.signal<string[]>(['apple', 'banana', 'orange', 'pineapple'], 'angular-example:items')

  // Вычисляемая цепочка на стороне ядра фреймворка
  public filteredItems = this.engine.computed<string[]>(() => {
    const query = this.search.value.toLowerCase()
    return this.items.value.filter(item => item.toLowerCase().includes(query))
  }, 'angular-example:computed:filtered')

  public updateSearch = (event: Event) => {
    const input = event.target as HTMLInputElement
    this.search.value = input.value
  }
}

@Component({
  selector: 'app-computed-example',
  standalone: true,
  // В шаблоне Angular Signals вызываются как функции: filtered() и search()
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular 16+ Computed Chain Example</div>
      
      <div class="catSection">
        <input 
          [value]="search()" 
          (input)="logic.updateSearch($event)" 
          placeholder="Фильтр фруктов..."
          class="inputMin"
        />
      </div>

      <div class="unitInternalWrapper">
        <div class="stack2">
          <strong>Результат вычислений:</strong>
          <ul>
            <li *ngFor="let item of filtered()">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./ui.common.module.scss', './ui.button.module.scss']
})
export class AngularComputedComponent {
  // 2. Инициализируем Angular-движок
  private engine = new ReactiveEngine4Angular()

  // 3. Внедряем сервис из DI-контейнера ядра
  public logic = this.engine.inject(FilterLogic)

  // 4. Адаптируем сигналы ядра для использования в шаблоне Angular
  public search = this.engine.use(this.logic.search)
  public filtered = this.engine.use(this.logic.filteredItems)
}
