import baseClasses from './ui.common.module.scss'
import clsx from 'clsx'
// + Переходник
import { CardModalWrapper, VueInReactWrapper } from './shared'
// Импортируем сам Vue-компонент
import Example003 from './003-signal-counter-vue/Example003.vue'

export const App = () => {
  return (
    <div className={clsx(baseClasses.stack4, baseClasses.appWrapper)} >
      <div className={baseClasses.stack0}>
        <h2>0. Signal</h2>
        <div className={clsx(baseClasses.unitsWrapper)}>
          <CardModalWrapper
            title='Example 003'
            description='Counter + Vue'
          >
            {/* Используем враппер для интеграции Vue в React DOM */}
            <VueInReactWrapper component={Example003} />
          </CardModalWrapper>
        </div>
      </div>
    </div>
  )
}
