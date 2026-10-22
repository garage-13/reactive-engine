import baseClasses from '~/ui.common.module.scss'
import clsx from 'clsx'
import { signal } from '@pravosleva/reactive-engine'
import { useReactiveValue } from '@pravosleva/reactive-engine/react'

// Атомарный сигнал с массивом живет вне жизненного цикла рендеринга
const todosSignal = signal(['Task 1', 'Task 2'])

export const Example121 = () => {
  // Хук автоматически подписывает компонент на изменения и возвращает чистое значение .value
  const todos = useReactiveValue(todosSignal)

  /** NOTE: v1 Иммутабельность - основа React.
   * В задачу либы не входило менять это поведение (для этого есть MobX)
  */
  const addTodoImmutable = () => {
    // Иммутабельно обновляем массив, инициируя точечный ререндер
    todosSignal.value = [...todosSignal.value, `Task ${Date.now()}`]
  }

  /** NOTE: v2 Если очень хочется мутировать массив, можно делать так (эффект будет тот же) */
  const addTodoMutable = () => {
    todosSignal.value.push(`Task ${Date.now()}`) // Мутируем на месте
    todosSignal.value = todosSignal.value        // Переприсваиваем, чтобы стриггерить подписку!
  }

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Array via useReactiveValue (Clean Code)</div>
      <button onClick={addTodoImmutable}>Add Task (immutable)</button>
      <button onClick={addTodoMutable}>Add Task (mutable)</button>
      <pre className={baseClasses.preNormalizedMin}>
        {JSON.stringify({ todos }, null, 2)}
      </pre>
    </div>
  )
}
