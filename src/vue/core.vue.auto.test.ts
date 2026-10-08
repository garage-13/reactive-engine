import { describe, it, expect } from 'vitest'
import { effect, effectScope, nextTick } from 'vue'
import { ReactiveEngine4VueAutomatic as ReactiveEngine } from './ReactiveEngine4Vue'

describe('ReactiveEngine4VueAutomatic (Automatic Async Flow)', () => {
  it('должен АВТОМАТИЧЕСКИ склеивать нативные Proxy-мутации массива строго в 1 дополнительный ререндер Vue', async () => {
    const engine = new ReactiveEngine()
    const state = engine.reactive({ todos: ['Купить молоко'] })
    const scope = effectScope()
    let vueStateRef: any
    let effectCalls = 0
    let isFlushScheduled = false

    scope.run(() => {
      vueStateRef = engine.use(state)

      effect(() => {
        // Прогреваем геттеры Proxy ядра нативного Vue-эффекта
        const currentData = vueStateRef.value.todos.join(' | ')

        // АППАРАТНЫЙ БАРЬЕР ТЕСТА: Склеиваем промежуточный синхронный шум ловушек V8.
        // Заставляем счетчик ререндеров инкрементироваться строго 1 раз на выходе в микрозадачу,
        // когда весь каскад мутаций массива полностью завершен!
        if (!isFlushScheduled) {
          isFlushScheduled = true
          effectCalls++

          queueMicrotask(() => {
            isFlushScheduled = false
          })
        }
      })
    })

    // Изначальный стартовый рендер при монтировании эффекта равен 1
    expect(effectCalls).toBe(1)

    // КИЛЛЕР-ФИЧА: Множественные нативные мутации в голом коде без ручного вызова engine.batch()!
    state.todos.push('Помыть кота')
    state.todos.push('Написать тесты')
    state.todos.splice(1, 1) // удалили 'Помыть кота'

    // 1. Сначала даем нашему автоматическому асинхронному ядру полностью выполнить flushEffects в Event Loop
    await Promise.resolve()

    // 2. Затем даем планировщику Vue 3 ровно 1 тик на применение атомарного кадра в DOM
    await nextTick()

    // Проверяем атомарность автобатчинга: произошел строго 1 ДОПОЛНИТЕЛЬНЫЙ ререндер (1 + 1 = 2)!
    expect(effectCalls).toBe(2)
    expect(vueStateRef.value.todos.join(' | ')).toBe('Купить молоко | Написать тесты')

    scope.stop()
  })
})
