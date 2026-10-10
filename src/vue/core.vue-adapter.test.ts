import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope, isRef, nextTick } from 'vue'
import { ReactiveEngineCore } from '../index' // Импортируем базовый класс типов ядра
import { useReactiveValue } from './core.vue-adapter'

const testEngines = [
  { name: 'ReactiveEngine (Synchronous Flow)', createEngine: () => new ReactiveEngineCore() }
]

testEngines.forEach(({ name, createEngine }) => {
  describe(`Vue 3 Adapter — Интеграция с ${name}`, () => {

    // ИСПРАВЛЕНО: Вместо any указываем честный базовый класс ядра!
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = createEngine()
    })

    it.skip('должен автоматически перевычислять цепочки computed-свойства на массивах', async () => {
      // Теперь дженерик <string[]> применится идеально, так как метод .signal типизирован в ReactiveEngineCore!
      const listSignal = engine.signal<string[]>(['apple', 'banana', 'orange'])

      const longWords = engine.computed(() => {
        // Теперь TypeScript строго знает, что 'word' — это string, implicit any полностью стерт!
        return listSignal.value.filter(word => word.length > 5)
      })

      const scope = effectScope()
      let output = ''

      scope.run(() => {
        const vueRef = useReactiveValue(longWords)
        output = vueRef.value.join('-')

        listSignal.value.push('pineapple')
        listSignal.value = listSignal.value
      })

      await nextTick()
      scope.stop()

      expect(longWords.value).toEqual(['banana', 'orange', 'pineapple'])
    })
  })
})
