import { Component } from '@angular/core'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Angular } from '@pravosleva/reactive-engine/angular'

interface UserFormState {
  user: {
    name: string
    age: number
  }
  status: 'draft' | 'submitted'
}

// 1. Изолированный сервис управления глубоким состоянием формы
class FormLogic extends AbstractService {
  // Инициализируем глубокий прокси-объект стейта
  public state = this.engine.reactive<UserFormState>({
    user: { name: 'Иван', age: 25 },
    status: 'draft'
  }, 'angular-example:form-state')

  public updateName = (event: Event) => {
    const input = event.target as HTMLInputElement
    this.state.user.name = input.value
  }

  public submitForm = () => {
    this.state.status = 'submitted'
  }
}

@Component({
  selector: 'app-reactive-example',
  standalone: true,
  template: `
    <div class="unit stack2">
      <div class="absoluteUnitLabel">Angular 16+ Deep Reactive Proxy Example</div>
      
      <div class="catSection" style="display: flex; gap: 8px; align-items: center;">
        <input 
          [value]="form().user.name" 
          (input)="logic.updateName($event)" 
          placeholder="Имя пользователя..."
          class="inputMin"
        />
        
        <button 
          (click)="logic.submitForm()" 
          class="btn neonBtn neonBtn--secondary neonBtn--contained"
        >
          Отправить форму
        </button>
      </div>

      <div class="unitInternalWrapper">
        <div class="stack2">
          <strong>Текущий снимок Proxy-состояния:</strong>
          <pre class="preNormalizedMin">Имя: {{ form().user.name }}</pre>
          <pre class="preNormalizedMin">Статус: {{ form().status }}</pre>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./ui.common.module.scss', './ui.button.module.scss']
})
export class AngularReactiveComponent {
  // 2. Инициализируем Angular-движок
  private engine = new ReactiveEngine4Angular()

  // 3. Инжектируем сервис логики
  public logic = this.engine.inject(FormLogic)

  // 4. Нативно подписываем Angular компонент на глубокие изменения Proxy-объекта
  public form = this.engine.use(this.logic.state)
}
