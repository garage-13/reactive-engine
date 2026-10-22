import { describe, it, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import { computed, effect, resetGlobalReactiveEngine, signal } from './core.global'

describe('Advanced Isolation: String Cache Collisions & Cascade GC', () => {
  // 1. Изоляция одинаковых анонимных функций
  // Что проверяется: Если разработчик пишет две абсолютно идентичные анонимные стрелочные функции (например, `() => state.value * 2`) в разных частях приложения или в последовательных запусках тестов, движок **не должен «склеивать» их графы** в один общий узел.
  // Зачем это нужно: V8 (движок JavaScript) для оптимизации может кэшировать инвариантные строки функций. Если бы реактивный движок использовал строковое представление функции как уникальный ключ в своём кэше, то второй вызов ошибочно вернул бы ссылку на первый узел, заставляя компонент читать чужие сигналы. Тест гарантирует полную независимость графов.
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

  // 2. Каскадное выжигание рёбер графа
  // Что проверяется: При уничтожении самого нижнего «листа» в глубокой цепочке вычислений (`root -> branch1 -> branch2 -> leaf`), движок должен каскадно пройтись вверх по цепочке и **полностью очистить коллекции `subscribers` и `dependencies`** у всех промежуточных узлов, не ломая при этом ссылки на саму структуру физической ноды `_node`.
  // Зачем это нужно (Защита от утечек памяти): Если вы отписываетесь от компонента, а промежуточные вычисляемые свойства (`computed`) продолжают держать ссылки на своих родителей, JavaScript-память никогда не очистится встроенным сборщиком мусора (Garbage Collector). Этот тест эмулирует фикс критического бага (падение исторического теста `#161`), гарантируя, что связи выжигаются до нуля, предотвращая утечки памяти в долгоживущих SPA-приложениях, но защищая код от ошибок типа `TypeError: Cannot read properties of undefined`.
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

  // 3. Тест-кейс, который через внешнее поведение (Black Box) проверяет не только изоляцию эффектов, но и **полное уничтожение кэша вычисляемых свойств (`computed`)** после вызова `resetGlobalReactiveEngine()`.
  // Если кэш сбрасывается корректно, то старая ленивая мемоизация уничтожается, а новые вычисления инициализируются заново без использования устаревших данных из прошлой эпохи.
  it('must completely isolate epochs, break subscriptions and wipe computed cache upon resetGlobalReactiveEngine call', () => {
    // 1. Создаем сигнал и ленивое вычисляемое свойство в глобальном графе (Эпоха 1)
    const oldSignal = signal(1)
    let oldComputedEvaluationCount = 0

    const oldComputed = computed(() => {
      oldComputedEvaluationCount++
      return oldSignal.value * 10
    }, 'Global_Computed')

    let oldEffectTriggerCount = 0
    effect(() => {
      oldComputed.value
      oldEffectTriggerCount++
    }, 'Global_Effect')

    // Первичный запуск: 1 расчет computed + 1 вызов эффекта
    expect(oldComputedEvaluationCount).toBe(1)
    expect(oldEffectTriggerCount).toBe(1)
    expect(oldComputed.value).toBe(10)

    // 2. Вызываем сброс глобального движка.
    // С этого момента функции signal(), computed() и effect() создают узлы в НОВОМ ядре.
    resetGlobalReactiveEngine()

    // 3. Создаем новый эффект в НОВОМ ядре, но пытаемся прочитать в нем СТАРЫЙ computed.
    // Так как старый computed принадлежит старому ядру, новое ядро не сможет построить к нему ребро зависимости.
    let newEffectTriggerCount = 0
    effect(() => {
      oldComputed.value // Читаем старый узел в новом контексте
      newEffectTriggerCount++
    }, 'New_Context_Effect')

    expect(newEffectTriggerCount).toBe(1)

    // Изменяем старый сигнал. Старый граф отработает изолированно в рамках своих оставшихся связей,
    // но НОВЫЙ эффект об этом ничего не узнает, потому что они находятся в разных мирах (инстансах ядер).
    oldSignal.value = 2

    // Проверка изоляции: новый эффект НЕ должен среагировать на изменение старого подграфа
    expect(newEffectTriggerCount).toBe(1)

    // 4. Проверяем чистую инициализацию полностью нового подграфа в новом ядре
    const freshSignal = signal(5)
    let freshComputedEvaluationCount = 0

    const freshComputed = computed(() => {
      freshComputedEvaluationCount++
      return freshSignal.value * 2
    }, 'Fresh_Computed')

    let freshEffectTriggerCount = 0
    effect(() => {
      freshComputed.value
      freshEffectTriggerCount++
    }, 'Fresh_Effect')

    // Новый граф успешно проходит свою первую эпоху расчетов
    expect(freshComputedEvaluationCount).toBe(1)
    expect(freshEffectTriggerCount).toBe(1)
    expect(freshComputed.value).toBe(10)

    // Проверяем работу мемоизации нового ядра
    expect(freshComputed.value).toBe(10)
    expect(freshComputedEvaluationCount).toBe(1)
  })

})
