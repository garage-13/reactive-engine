import { useEffect } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import clsx from 'clsx'

// 1. Описываем интерфейс сложной структуры данных
interface UserProfileForm {
  name: string;
  meta: {
    age: number;
    role: string;
  };
}

// 2. Создаем сервис бизнес-логики с использованием метода reactive
class UserProfileLogic extends AbstractService {
  // Инициализируем вложенный прокси-объект
  public user = this.engine.reactive<UserProfileForm>({
    name: 'Иван',
    meta: {
      age: 25,
      role: 'Разработчик'
    }
  }, 'example-111:user');

  // Выносим computed-мост на уровень сервиса.
  // Теперь это полноценный инстанс Computed, соответствующий контракту ядра фреймворка!
  // Он будет автоматически и точечно пересчитываться только при изменении name, age или role.
  public uiBridge = this.engine.computed(() => ({
    name: this.user.name,
    age: this.user.meta.age,
    role: this.user.meta.role
  }), 'example-111:computed:ui-bridge');

  // Мутируем свойства напрямую
  public updateName = (newName: string) => {
    this.user.name = newName;
  }

  public celebrateBirthday = () => {
    this.user.meta.age += 1;
  }

  public changeRole = (newRole: string) => {
    this.user.meta.role = newRole;
  }
}

// Инициализируем инстанс движка с логгером
const engine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: true,
    filter: /^example-111:*/
  }
})

export const Example111 = () => {
  const logic = engine.inject(UserProfileLogic);

  // Передаем готовый инстанс computed-моста в метод engine.use()
  const user = engine.use(logic.uiBridge);

  // -- NOTE: Заметтьте, эти эффекты будут выполняться по необхдимости
  useEffect(() => console.log(`React effect: user.name -> ${user.name}`), [user.name])
  useEffect(() => console.log(`React effect: user.age -> ${user.age}`), [user.age])
  useEffect(() => console.log(`React effect: user.role -> ${user.role}`), [user.role])
  // --

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Reactive Proxy Object</div>

      {/* Вывод реактивных данных прокси */}
      <div className={baseClasses.stack1} style={{ fontFamily: 'system-ui' }}>
        <div>👤 Имя пользователя: <span style={{ color: '#00b4d8', fontWeight: 'bold' }}>{user.name}</span></div>
        <div>🎂 Возраст: <span style={{ color: '#42b883' }}>{user.age} лет</span></div>
        <div>💼 Роль в системе: <span style={{ color: '#e01e5a' }}>{user.role}</span></div>
      </div>

      {/* Панель интерактивного изменения свойств напрямую */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => logic.updateName(logic.user.name === 'Иван' ? 'Александр' : 'Иван')}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >
          🔄 Изменить имя
        </button>

        <button
          onClick={logic.celebrateBirthday}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--secondary'], btnClasses['neonBtn--outlined'])}
        >
          🍰 Отпраздновать день рождения (+1)
        </button>

        <button
          onClick={() => logic.changeRole(logic.user.meta.role === 'Разработчик' ? 'Тимлид' : 'Разработчик')}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--contained'])}
        >
          🚀 Поменять роль
        </button>
      </div>
    </div>
  )
}
