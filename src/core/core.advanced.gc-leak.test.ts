import { describe, it, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('Advanced Isolation: String Cache Collisions & Cascade GC', () => {

  it('should NOT collide computed nodes with identical bodies in sequential batches // 1. Гарантирует, что если разработчик пишет анонимные стрелочные функции с одинаковым телом в разных местах приложения или тестов, движок не склеит их графы в один мутантный узел на выходе из batch', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const s1 = engine.signal(1)
    const s2 = engine.signal(10)

    let c1: any
    let c2: any

    // Имитируем первый прогон (например, тест А)
    engine.batch(() => {
      // Inline-функция, которая компилируется в идентичную строку для V8
      c1 = engine.computed(() => s1.value * 2)
      expect(c1.value).toBe(2)
    })

    // Имитируем второй изолированный прогон (например, тест Б) с точно такой же строкой функции
    engine.batch(() => {
      // Если батч-кэш протек наружу или не очистился, c2 подменится на c1 и будет читать s1 вместо s2!
      c2 = engine.computed(() => s2.value * 2)
      expect(c2.value).toBe(20)
    })

    // Проверяем честную независимость графов после выхода из батчей
    engine.batch(() => {
      s1.value = 2
      s2.value = 20
    })

    expect(c1.value).toBe(4)
    expect(c2.value).toBe(40) // Жесткий срез: узел c2 обязан вернуть 40, а не 4!
  })

  it('must preserve internal _node structure on intermediate components during deep cascade destroy // Эмулирует в чистом виде падение теста #161 и гарантирует, что при вызове .destroy() ссылки на _node промежуточных вычислений не испарятся из памяти, а коллекции subscribers и dependencies каскадно обнулятся', () => {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })

    const root = engine.signal(100)

    // Строим глубокую матрешку зависимостей
    const branch1 = engine.computed(() => root.value + 1)
    const branch2 = engine.computed(() => branch1.value + 1)
    const leaf = engine.computed(() => branch2.value + 1)

    // Активируем граф через подписку эффекта
    const unsubscribe = engine.effect(() => {
      leaf.value
    })

    engine.flushEffects()

    // Убираем внешнего слушателя (граф готов к GC чистке)
    unsubscribe()

    // ⚡ Вызываем деструктор самого нижнего листа графа
    leaf.destroy()

    // Защитный ассерты: проверяем, что ссылки _node не занулились и не превратились в undefined
    expect(branch2 as any).toBeDefined()
    expect((branch2 as any)._node).toBeDefined() // Защита от TypeError
    expect((branch2 as any)._node.subscribers.size).toBe(0) // Проверка успешного выжигания рёбер

    expect(branch1 as any).toBeDefined()
    expect((branch1 as any)._node).toBeDefined() // Защита от TypeError
    expect((branch1 as any)._node.subscribers.size).toBe(0) // Проверка до самого верха

    expect((root as any)._node.subscribers.size).toBe(0)
  })
})
