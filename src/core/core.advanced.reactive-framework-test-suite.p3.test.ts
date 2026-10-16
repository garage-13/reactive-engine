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
    expect(child.value).toBe(24)
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

  // it('#12/#13/#166/#189/#205 TDD Тест: переиспользование одной ссылки на функцию между независимыми графами // фундаментальный архитектурный баг коллизии канонического кэша, из-за которого в матрице reactive-framework-test-suite рухнули сразу 60 тестов (включая #12, #13, #166 из сектора Dynamic Dependencies, а также #189, #205 из Graph Propagation)', () => {
  //   const engine = new ReactiveEngineCore()

  //   const sharedFn = () => engine.untrack(() => currentSignal.value * 2)

  //   let currentSignal = engine.signal(5)
  //   const c1 = engine.computed(sharedFn)
  //   expect(c1.value).toBe(10)

  //   // Симулируем следующий тест: сигнал пересоздан, но функция та же!
  //   currentSignal = engine.signal(50)
  //   const c2 = engine.computed(sharedFn)

  //   // На 2.5.0-alpha.0 из-за WeakMap вернется c1, привязанный к старому сиротскому сигналу!
  //   expect(c2.value).toBe(100)
  // })

  it('#12/#13/#166/#189/#205 Репродукция #3-TDD (Site Strict): Переиспользование одной ссылки на функцию (WeakMap Pollution) между независимыми графами', () => {
    const engine = new ReactiveEngineCore()

    let currentSignal = engine.signal(5)
    const sharedFn = () => engine.untrack(() => currentSignal.value * 2)

    const c1 = engine.computed(sharedFn)
    expect(c1.value).toBe(10)

    // Симулируем следующий тест матрицы: сигнал пересоздан, но функция sharedFn та же!
    currentSignal = engine.signal(50)
    const c2 = engine.computed(sharedFn)

    expect(c2.value).toBe(100)
  })

  it('Репродукция деградации Dynamic Dependencies: Коллизия пересоздания бесбатчевых нод на долгоживущем ядре', () => {
    const engine = new ReactiveEngineCore()

    const sharedFn = () => currentSignal.value + 10

    // --- ИМИТАЦИЯ ТЕСТА №1 (БЕЗ БАТЧА) ---
    let currentSignal = engine.signal(1)
    const c1 = engine.computed(sharedFn)
    expect(c1.value).toBe(11)

    // --- ИМИТАЦИЯ ТЕСТА №2 (БЕЗ БАТЧА) ---
    // Пересоздаем сигнал, имитируя новый тест спецификации
    currentSignal = engine.signal(50)

    // Пересоздаем компьютед на той же функции.
    // В 2.5.0-alpha.1 создастся новая нода, но старая c1 не вычистит subscribers,
    // либо затрет кэш, нарушив канонический порядок динамических веток.
    const c2 = engine.computed(sharedFn)

    expect(c2.value).toBe(60)
  })

})

describe('⚛️ Критический регрессионный сьют: Изоляция текстового кэша между бесбатчевыми тестами', () => {

  it('Репродукция деградации Dynamic Dependencies: Коллизия пересоздания бесбатчевых нод с подписчиком', () => {
    const engine = new ReactiveEngineCore()

    const sharedFn = () => currentSignal.value * 2

    // --- ИМИТАЦИЯ ТЕСТА №1 РAНЕРA (БЕЗ БAТЧA) ---
    let currentSignal = engine.signal(10)
    const c1 = engine.computed(sharedFn)

    // Имитируем живой контекст ранера сьюта: подписываемся на computed,
    // переводя subscribers.size в значение > 0
    const unsubscribe = c1.subscribe(() => {})
    expect(c1.value).toBe(20)

    // --- ИМИТАЦИЯ ТЕСТА №2 РAНЕРA (БЕЗ БAТЧA) ---
    // Сигнал пересоздан в лексическом скоупе ранера
    currentSignal = engine.signal(100)

    // В 2.5.0-alpha.4 из-за subscribers.size > 0 проверка сброса промахнется,
    // и вызов вернет старый стабильный узел c1, смотрящий на мертвый сигнал!
    const c2 = engine.computed(sharedFn)

    expect(c2.value).toBe(200)

    unsubscribe()
  })
})

describe('⚛️ Финальный регрессионный сьют: Топология и Восстановление динамических ребер', () => {

  it('Репродукция #166: Полная семантика восстановления динамической зависимости после деактивации', () => {
    const engine = new ReactiveEngineCore()

    const flag = engine.signal(true)
    const src = engine.signal(10)

    let computedRuns = 0
    const c = engine.computed(() => {
      computedRuns++
      return flag.value ? src.value : 0
    })

    // 1. Создаем живой эффект, как это делает серверный ранер
    let effectValue = 0
    let effectRuns = 0
    engine.effect(() => {
      effectRuns++
      effectValue = c.value
    })

    expect(effectValue).toBe(10)
    expect(computedRuns).toBe(1)
    expect(effectRuns).toBe(1)

    // 2. Отключаем ветку: flag -> false. Узел c больше не зависит от src
    flag.value = false
    expect(effectValue).toBe(0)
    expect(computedRuns).toBe(2)
    expect(effectRuns).toBe(2)

    // 3. Мутируем спящий src. Узел c и эффект НЕ ДОЛЖНЫ просыпаться!
    src.value = 50
    expect(computedRuns).toBe(2) // Спит
    expect(effectRuns).toBe(2)   // Спит

    // 4. Возвращаем flag -> true. Узел c ОБЯЗАН лениво восстановить ребро с src и забрать актуальное 50
    flag.value = true

    // Из-за ложного совпадения эпох verifiedInEpoch узел c посчитает себя стабильным,
    // эффект выполнится, но запишет старое закэшированное значение 10 вместо 50!
    expect(effectValue).toBe(50)
    expect(computedRuns).toBe(3)
  })

  it('Репродукция #189: batch + dynamic deps — предотвращение лишних вычислений сирот (Transitive Unreachable Cut)', () => {
    const engine = new ReactiveEngineCore()

    const a = engine.signal(1)
    const b = engine.signal(2)
    const c = engine.signal(3)

    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return c.value + 100
    })

    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      return a.value > 0 ? b.value + d.value : b.value
    })

    let effectValue = 0
    engine.effect(() => {
      effectValue = e.value
    })

    expect(effectValue).toBe(105) // 2 + (3 + 100) = 105
    expect(dRuns).toBe(1)
    expect(eRuns).toBe(1)

    // ⚡ ТРИГГЕР ЛОЖНОГО ГЛИЧА: Изменяем все 3 источника в одном батче.
    // Переводим a в 0, что делает ветку с d транзитивно недостижимой (unreachable).
    engine.batch(() => {
      a.value = 0
      b.value = 10
      c.value = 300 // Сигнал изменился, но его потребитель d больше не нужен!
    })

    // Идеальный граф обязан понять, что ветка d отсечена, и dRuns ДОЛЖНО остаться строго 1.
    // Но наше ядро выполнит холостой рекомпьют d, увеличив dRuns до 2!
    expect(dRuns).toBe(1)
    expect(effectValue).toBe(10) // e.value должно стать просто b.value (10)
  })

  it('Репродукция #189/#205: Нарушение топологического порядка из-за не-атомарного флуша батча', () => {
    const engine = new ReactiveEngineCore()

    const a = engine.signal(1)
    const b = engine.signal(2)

    // c зависит от b, d зависит от a и c (классический асимметричный алмаз)
    const c = engine.computed(() => b.value * 10)

    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return a.value + c.value
    })

    let effectValue = 0
    engine.effect(() => {
      effectValue = d.value
    })

    expect(effectValue).toBe(21) // 1 + 20
    expect(dRuns).toBe(1)

    // Мутируем оба сигнала в батче.
    // Из-за поочередного флуша сигналов, d увидит промежуточное грязное состояние
    // и выполнится лишний раз (Glitch), нарушая спецификацию стабильности!
    engine.batch(() => {
      b.value = 3 // c станет 30
      a.value = 5
    })

    expect(effectValue).toBe(35) // 5 + 30

    expect(dRuns).toBe(1)
  })

})
