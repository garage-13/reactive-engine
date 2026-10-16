import { describe, it, expect } from 'vitest'
import { ReactiveEngineCore } from './core'
import { batch, computed, signal } from './core.global'

describe('⚛️ Тест на воспроизведение регресса матрицы reactive-framework-test-suite', () => {
  it('Репродукция #95: линейная цепочка обязана вычисляться заново при повторном пулле, если корень изменился внутри батча', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(1)

    // Симулируем ранер сьюта: функции-лямбды с одинаковой сигнатурой строки
    const createB = () => engine.computed(() => a.value + 1)
    const createC = () => engine.computed(() => {
      // Принудительно достаем B из batchComputedCache по строке
      const bNode = createB()
      return bNode.value + 1
    })

    // Инициализируем и греем кэш
    expect(createC().value).toBe(3) // a(1) -> b(2) -> c(3)

    // Запускаем транзакцию батча
    engine.batch(() => {
      a.value = 10

      // 🚨 ТОЧКА ПАДЕНИЯ БАГА batchIterationId:
      // При повторном вызове createC() извлечет ноду из batchComputedCache.
      // Если в коде стоит слепая проверка по iterationId, нода вернет старый кэш `3`,
      // проигнорировав тот факт, что s.value внутри батча изменился на 10!
      const currentC = createC()
      expect(currentC.value).toBe(12) // Ожидаем 12, а с багом вернется 3!
    })
  })

  it('Репродукция #94: алмазная зависимость (Diamond Tree) с переиспользованием кэша строк', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(1)

    const createLeft = () => engine.computed(() => a.value * 2)
    const createRight = () => engine.computed(() => a.value * 3)

    const createDiamondTail = () => engine.computed(() => {
      return createLeft().value + createRight().value
    })

    // Прогрев
    expect(createDiamondTail().value).toBe(5)

    engine.batch(() => {
      a.value = 2

      // Из-за повторного извлечения из batchComputedCache левое и правое крыло
      // обязаны пересчитаться под новое значение корня.
      // С багом iterationId правое крыло выдаст старое значение, и сумма сойдется неверно.
      expect(createDiamondTail().value).toBe(10) // Ожидаем 10, а с багом вернется 5!
    })
  })

  it('Локальный TDD-тест: валидация каскада вложенных вычислений на общем пуле', () => {
    const engine = new ReactiveEngineCore()

    const source = engine.signal(1)

    // Узел 1 (Родитель)
    const parent = engine.computed(() => source.value + 10)

    // Узел 2 (Ребенок, вызывается внутри вычисления соседа или каскада)
    const child = engine.computed(() => parent.value * 2)

    // Регистрируем эффект, чтобы заставить граф ожить
    let effectValue = 0
    engine.effect(() => {
      effectValue = child.value
    })

    expect(effectValue).toBe(22) // (1 + 10) * 2 = 22

    // Мутируем корень графа
    source.value = 2

    // 🚨 ТОЧКА КАТАСТРОФЫ ОБЩЕГО ПУЛА:
    // При каскадном вызове run() ребенок затрет пул родителя,
    // родитель не сможет правильно обновить epVersions/subscribers,
    // и граф вернет старое или сломанное значение!
    expect(child.value).toBe(24) // Ожидаем 24, но из-за коллизии пула вернется старое значение!
  })

  it('Имитация Тест-кейса №1 ранера', () => {
    const s1 = signal(5)
    batch(() => {
      const c1 = computed(() => s1.value * 2)
      expect(c1.value).toBe(10)
    })
  })

  it('Имитация Тест-кейса №2 ранера (Обязан упасть на 2.5.0-alpha.0)', () => {
    const s2 = signal(100)
    batch(() => {
      // Функция текстово идентична Тесту №1, но привязана к s2!
      // Из-за утечки batchComputedCache в globalEngine вернется нода из Теста №1!
      const c2 = computed(() => s2.value * 2)

      // 🔴 КРИТИЧЕСКИЙ ФЕЙЛ МАТРИЦЫ: Вернет 10 вместо 200!
      expect(c2.value).toBe(200)
    })
  })

  it('Локальный TDD-тест #189-Repro: каскад зависимых вычислений на общем пул-массиве', () => {
    /* NOTE: Тест #189 проверяет топологический порядок (Topological Order) вычислений при изменении нескольких сигналов одновременно в рамках одной транзакции.
    S(a)  S(b)  S(c)
      │     │     │
      │    C(d) ← reads c
        \   /
        C(e) ← reads b, d when a > 0; only b when a <= 0

    */
    const engine = new ReactiveEngineCore()

    const source = engine.signal(1)

    // Компьютед 1 (Родитель)
    const parent = engine.computed(() => source.value + 10)

    // Компьютед 2 (Ребенок) — заставляет рантайм каскадно зайти в run() родителя
    const child = engine.computed(() => parent.value * 2)

    // Эффект для удержания графа в активном состоянии
    let effectValue = 0
    engine.effect(() => {
      effectValue = child.value
    })

    expect(effectValue).toBe(22) // (1 + 10) * 2 = 22

    // Мутируем корень графа
    source.value = 2

    // Стягиваем значение.
    // Из-за коллизии в engine._poolArr связи сломаются, и вернется старое значение 22!
    expect(child.value).toBe(24) // 🔴 ЗДЕСЬ БУДЕТ ФЕЙЛ (Received: 22 вместо 24)!
  })

  it('Локальный TDD-тест: глубокая мутация свойств объекта по одной ссылке внутри батча', () => {
    const engine = new ReactiveEngineCore()

    // Создаем объектный стейт
    const user = engine.signal({ name: 'Ivan', age: 20 })

    let computedRuns = 0
    const selector = engine.computed(() => {
      computedRuns++
      return `${user.value.name} is ${user.value.age}`
    })

    expect(selector.value).toBe('Ivan is 20')
    expect(computedRuns).toBe(1)

    // Имитируем поведение ранера: меняем свойство внутри и пинаем ссылку саму в себя
    engine.batch(() => {
      user.value.age = 21
      user.value = user.value

      // С багом избыточного зануления кэша здесь произойдет холостой пересчет
      expect(selector.value).toBe('Ivan is 21')
    })

    expect(computedRuns).toBe(2) // Должно выполниться строго 2 раза за весь цикл
  })

  it('Локальный TDD-тест: асимметричный алмазный граф не должен делать дублирующие вычисления при выходе из батча', () => {
    const engine = new ReactiveEngineCore()
    const root = engine.signal(1)

    // Левое крыло
    const left = engine.computed(() => root.value + 10)
    // Правое крыло — всегда возвращает константу (Value Equality Cut)
    const right = engine.computed(() => {
      const _ = root.value
      return 100
    })

    let tailRuns = 0
    const tail = engine.computed(() => {
      tailRuns++
      return left.value + right.value
    })

    expect(tail.value).toBe(111)
    expect(tailRuns).toBe(1)

    // Запускаем мутацию в батче
    engine.batch(() => {
      root.value = 2
    })

    // Вызываем актуализацию хвоста
    expect(tail.value).toBe(112)

    // КРИТИЧЕСКИЙ ИНВАРИАНТ СЬЮТА: Так как правое крыло вернуло тот же 100,
    // узел tail должен пересчитаться строго 1 раз. Если markDirty(2) сбросил кэш вслепую,
    // здесь выполнится лишний проход.
    expect(tailRuns).toBe(2)
  })

})
