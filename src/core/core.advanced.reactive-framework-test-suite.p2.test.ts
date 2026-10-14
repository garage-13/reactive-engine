import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('⚛️ Reactive Framework Test Suite — Пакет P2 (Интеграционные бенчмарки)', () => {

  test('#34: pruning stops at first unchanged node', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // b зажимает значение a в диапазоне 0 или 1
    const b = engine.computed(() => (a.value > 0 ? 1 : 0))
    const c = engine.computed(() => b.value + 1)

    const spy = vi.fn()
    engine.effect(() => {
      spy(c.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(1) // b = 0, c = 1

    // Первый шаг: b меняется с 0 на 1. Эффект должен сработать.
    spy.mockClear()
    a.value = 5
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(2) // b = 1, c = 2

    // Второй шаг (критический): b остается равным 1!
    // Дальнейшее распространение (propagation) ОБЯЗАНО остановиться на узле b.
    spy.mockClear()
    a.value = 10
    expect(spy).not.toHaveBeenCalled() // c не должен пересчитываться, эффект молчит
  })

  test('#169: live pruning: effect not re-run when intermediate computed returns same', () => {
    const engine = new ReactiveEngineCore()
    const s = engine.signal(1)

    const c1 = engine.computed(() => s.value * 2)
    // c2 всегда возвращает константу 5, независимо от изменений c1
    const c2 = engine.computed(() => {
      const _ = c1.value
      return 5
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(c2.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(5)

    // Мутируем корень. c1 изменится, но c2 вернет то же самое значение (5).
    // Живая обрезка графа должна предотвратить повторный вызов эффекта.
    spy.mockClear()
    s.value = 2
    expect(spy).not.toHaveBeenCalled()
  })

  test('#220: computed same object reference — no downstream propagation', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // Постоянная ссылка на один и тот же объект
    const staticObj = { key: 'stable' }

    const b = engine.computed(() => {
      const _ = a.value
      return staticObj
    })

    const c = engine.computed(() => {
      return { data: b.value }
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(c.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)

    // Мутируем корень. b перезапустится, но вернет ту же самую объектную ссылку staticObj.
    // Граф обязан заблокировать downstream-уведомления, так как Object.is(old, new) истинен.
    spy.mockClear()
    a.value = 1
    expect(spy).not.toHaveBeenCalled()
  })

  test('#P2-4 (ex-#P2-1): сквозная изоляция транзакций batch внутри глубоко вложенных untrack', () => {
    const engine = new ReactiveEngineCore()
    const trigger = engine.signal(0)
    const spy = vi.fn()

    engine.effect(() => {
      spy(trigger.value)
    })

    engine.untrack(() => {
      engine.batch(() => {
        trigger.value = 1
        trigger.value = 2
      })
    })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith(2)
  })

  test('#P2-5 (ex-#P2-2): каскадное динамическое переключение ветвей (Conditional Evaluation) повышенной сложности', () => {
    const engine = new ReactiveEngineCore()
    const switchA = engine.signal(true)
    const switchB = engine.signal(true)
    const data = engine.signal('init')

    const spy = vi.fn()

    const computedChild = engine.computed(() => {
      if (!switchB.value) return 'branch-b-closed'
      return data.value
    })

    engine.effect(() => {
      if (switchA.value) {
        spy(computedChild.value)
      } else {
        spy('branch-a-closed')
      }
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith('init')

    switchA.value = false
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith('branch-a-closed')

    spy.mockClear()
    data.value = 'mutated-data'
    expect(spy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // ⚡ ГРУППА: ЛЕНИВЫЙ БАТЧИНГ И ДИНАМИЧЕСКАЯ НЕДОСТИЖИМОСТЬ
  // =========================================================================

  test('#147: computed not recomputed in batch if dep reverts to original value', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    let computedRuns = 0
    const c = engine.computed(() => {
      computedRuns++
      return a.value * 2
    })

    // Прогреваем computed первичным чтением
    expect(c.value).toBe(0)
    expect(computedRuns).toBe(1)

    // Запускаем транзакцию с полным откатом (Net change = 0)
    engine.batch(() => {
      a.value = 5
      a.value = 0 // Значение полностью вернулось к исходному до закрытия батча
    })

    // Идеальный движок НЕ должен инвалидировать кэш и перезапускать computed!
    expect(c.value).toBe(0)
    expect(computedRuns).toBe(1) // Должно остаться строго 1 (холостой пересчет заблокирован)
  })

  test('#188: batch + dynamic deps: unnecessary recompute of unreachable branch avoided', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)

    let cRuns = 0
    const c = engine.computed(() => {
      cRuns++
      return b.value + 10
    })

    // Узел d читает узел c ТОЛЬКО когда a === 0
    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return a.value === 0 ? c.value : 999
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(d.value)
    })

    expect(spy).toHaveBeenCalledWith(10) // a=0 -> c=10 -> d=10
    expect(cRuns).toBe(1)
    expect(dRuns).toBe(1)

    spy.mockClear()

    // Внутри батча меняем а на 1 (что делает ветку c недостижимой) и одновременно меняем b
    engine.batch(() => {
      a.value = 1
      b.value = 5
    })

    // Так как после закрытия батча a === 1, узел d уходит в ветку 999.
    // Узел c становится полностью изолированным (unreachable).
    // Его функция вычисления НЕ ДОЛЖНА запускаться вообще!
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(999)
    expect(cRuns).toBe(1) // Сигнал b изменился, но ветка c мертва -> cRuns не должно расти!
  })

  test('#189: multi-signal change: topological ordering preserved and unreachable skipped', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)
    const c = engine.signal(0)

    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return c.value * 2
    })

    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      // Если a > 0, мы зависим от b и d. Если a <= 0, мы зависим ТОЛЬКО от b!
      return a.value > 0 ? b.value + d.value : b.value + 100
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(e.value)
    })

    expect(spy).toHaveBeenLastCalledWith(100) // a=0 -> b=0 + 100
    expect(dRuns).toBe(0) // d изначально вообще не читается, так как a <= 0
    expect(eRuns).toBe(1)

    spy.mockClear()

    // Внутри батча меняем b, но сохраняем a <= 0
    engine.batch(() => {
      b.value = 10
      c.value = 5 // c поменялся, но его потребитель d все еще находится в слепой зоне для e
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(110) // b=10 + 100
    expect(dRuns).toBe(0) // d по-прежнему недостижим и НЕ должен вычисляться!
  })

  // =========================================================================
  // 💀 ГРУППА: ЖИЗНЕННЫЙ ЦИКЛ ЭФФЕКТOВ И ДИНАМИЧЕСКOЕ УНИЧТOЖЕНИЕ
  // =========================================================================
  test('#201: computed-triggered disposal — effect skipped and no subscription leak', () => {
    const engine = new ReactiveEngineCore()
    const s = engine.signal(0)

    let e1Runs = 0
    let e2Runs = 0

    // Объявляем ссылки на dispose-функции заранее
    let disposeE1: () => void = () => {}

    // Вычисляемое свойство, которое на значении s === 1 уничтожает e1
    const a = engine.computed(() => {
      if (s.value === 1) {
        disposeE1() // Уничтожаем эффект e1 ПРЯМO из тела computed во время его вычисления!
      }
      return s.value * 10
    })

    // Создаем два эффекта-слушателя
    disposeE1 = engine.effect(() => {
      const _ = a.value
      e1Runs++
    })

    const disposeE2 = engine.effect(() => {
      const _ = a.value
      e2Runs++
    })

    // Прогрев графа
    expect(e1Runs).toBe(1)
    expect(e2Runs).toBe(1)

    // Триггерим мутацию, запускающую disposal
    s.value = 1

    // КРИТИЧЕСКИЕ УТВЕРЖДЕНИЯ СЛЕДСТВИЯ:
    // 1. Эффект e2 обязан выполниться и получить новое значение (10)
    expect(e2Runs).toBe(2)
    // 2. Эффект e1 был уничтожен ПРЕДВАРИТЕЛЬНO посреди флуша, поэтому он НЕ должен нарастить счетчик!
    expect(e1Runs).toBe(1)

    // Проверяем на утечку подписок (Subscription Leak)
    s.value = 2
    expect(e1Runs).toBe(1) // e1 мертв, счетчик стоит
    expect(e2Runs).toBe(3) // e2 живет и реагирует
  })

  test('#202: computed-triggered disposal — sibling effects still notified correctly', () => {
    const engine = new ReactiveEngineCore()
    const s = engine.signal(0)

    let disposeE1: () => void = () => {}

    const a = engine.computed(() => {
      if (s.value === 1) {
        disposeE1()
      }
      return s.value + 100
    })

    // Инициализируем e1, который будет уничтожен
    disposeE1 = engine.effect(() => {
      const _ = a.value
    })

    // Сиблинг (соседний эффект), который должен выжить несмотря на мутацию итератора в Set
    const spySibling = vi.fn()
    engine.effect(() => {
      spySibling(a.value)
    })

    expect(spySibling).toHaveBeenLastCalledWith(100)
    spySibling.mockClear()

    // Запускаем триггер
    s.value = 1

    // Соседний эффект обязан стабильно проснуться и получить свежее значение,
    // мутация Set.prototype.delete не должна сбить итератор планировщика!
    expect(spySibling).toHaveBeenCalledTimes(1)
    expect(spySibling).toHaveBeenLastCalledWith(101)
  })

  test('#40: effect cleanup runs completely outside reactive evaluation context', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)

    let cleanupSpy = vi.fn()
    let effectSpy = vi.fn()

    const dispose = engine.effect(() => {
      effectSpy(a.value)

      return () => {
        // Функция очистки (cleanup) СЧИТЫВАЕТ сигнал b.
        // Это НЕ должно создавать реактивную подписку эффекта на сигнал b!
        cleanupSpy(b.value)
      }
    })

    expect(effectSpy).toHaveBeenCalledTimes(1)
    expect(effectSpy).toHaveBeenLastCalledWith(0)

    // Первый перезапуск эффекта, чтобы сработал первый cleanup
    effectSpy.mockClear()
    cleanupSpy.mockClear()
    a.value = 1

    expect(effectSpy).toHaveBeenCalledTimes(1)
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    expect(cleanupSpy).toHaveBeenLastCalledWith(0)

    // КРИТИЧЕСКАЯ ПРОВЕРКА: Изменяем сигнал b.
    // Поскольку cleanup обязан выполняться в режиме untracked, эффект НЕ должен реагировать!
    effectSpy.mockClear()
    cleanupSpy.mockClear()
    b.value = 10

    expect(effectSpy).not.toHaveBeenCalled()
    expect(cleanupSpy).not.not.toHaveBeenCalled() // Тишина, утечки контекста нет

    dispose()
  })

  test('#111: cleanup-triggered dispose prevents subsequent scheduled re-runs', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    let effectRuns = 0
    let dispose: () => void

    dispose = engine.effect(() => {
      effectRuns++
      const _ = a.value

      return () => {
        // Эффект уничтожает сам себя прямо внутри своей функции очистки!
        if (a.value === 1) {
          dispose()
        }
      }
    })

    expect(effectRuns).toBe(1)

    // Триггерим изменение, которое вызовет cleanup с условием a === 1
    a.value = 1
    expect(effectRuns).toBe(2) // Эффект перезапустился во второй раз и вызвал dispose()

    // КРИТИЧЕСКАЯ ПРОВЕРКА: Теперь эффект полностью мёртв и отписан.
    // Последующие мутации сигнала 'a' не должны приводить к его вызову!
    a.value = 2
    expect(effectRuns).toBe(2) // Счетчик замер на двух, эффект успешно уничтожен
  })

  // =========================================================================
  // 🌳 ГРУППА: ВЛOЖЕННЫЕ КОНТЕКСТЫ И КАСКАДНOЕ УНИЧТOЖЕНИЕ
  // =========================================================================

  test('#209: three-level nested effect — cascading disposal removes grandchild links', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    let outerRuns = 0
    let middleRuns = 0
    let innerRuns = 0

    // Создаем трехслойную вложенность эффектов
    const disposeOuter = engine.effect(() => {
      outerRuns++
      const _ = a.value

      engine.effect(() => {
        middleRuns++

        engine.effect(() => {
          innerRuns++
        })
      })
    })

    expect(outerRuns).toBe(1)
    expect(middleRuns).toBe(1)
    expect(innerRuns).toBe(1)

    // Вызываем dispose самого верхнего уровня
    disposeOuter()

    // Мутируем сигнал. Ни один из вложенных эффектов не должен проснуться!
    a.value = 10

    expect(outerRuns).toBe(1)
    expect(middleRuns).toBe(1)
    expect(innerRuns).toBe(1) // Если каскад сломан, счетчики вырастут
  })

  test('#210: multiple inner effects all cleaned when outer re-runs', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(0)

    let innerB_Runs = 0
    let innerC_Runs = 0

    engine.effect(() => {
      const _ = a.value // Зависимость внешнего эффекта

      // Каждый раз при перезапуске внешнего эффекта создаются новые внутренние эффекты
      engine.effect(() => {
        const _ = b.value
        innerB_Runs++
      })
    })

    expect(innerB_Runs).toBe(1)

    // Перезапускаем ВНЕШНИЙ эффект.
    // Старый внутренний эффект ОБЯЗАН автоматически уничтожиться перед созданием нового!
    a.value = 1

    // Пинаем сигнал b. Если старый эффект не удалился, он сработает как зомби
    innerB_Runs = 0
    b.value = 100

    expect(innerB_Runs).toBe(1) // Должен сработать строго 1 раз (только новый инстанс эффекта)
  })

  test('#193: sequential dirty check — branch switch skips unreachable computed completely', () => {
    const engine = new ReactiveEngineCore()

    // Явно задаем тип, разрешающий null
    const sourceA = engine.signal<number | null>(1)

    // b зависит от sourceA
    const b = engine.computed(() => sourceA.value)

    // c зависит от b. Если b становится null, c не должен пересчитываться холосто!
    let cRuns = 0
    const c = engine.computed(() => {
      cRuns++
      return b.value ? (b.value as number) * 10 : 0
    })

    // d динамически переключает ветку: если b равен null, он возвращает 999 и СКРЫВАЕТ ветку c!
    let dRuns = 0
    const d = engine.computed(() => {
      dRuns++
      return b.value !== null ? c.value : 999
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(d.value)
    })

    expect(spy).toHaveBeenLastCalledWith(10) // a=1 -> b=1 -> c=10 -> d=10
    expect(cRuns).toBe(1)
    expect(dRuns).toBe(1)

    // ТРИГГЕР МУТАЦИИ: Переводим ветку в null
    spy.mockClear()
    sourceA.value = null // Изменение значения через правильную переменную

    // КРИТИЧЕСКИЕ УТВЕРЖДЕНИЯ СЛЕДСТВИЯ:
    // d обязан переключиться на ветку 999.
    // А узел c стал НЕДОСТИЖИМЫМ. Его функция fn() НЕ ДОЛЖНА запускаться во второй раз!
    expect(spy).toHaveBeenLastCalledWith(999)
    expect(cRuns).toBe(1) // Если cRuns станет равен 2 — значит, недостижимая ветка проснулась холосто
  })

  // =========================================================================
  // 🔬 ГРУППА: ФИНАЛЬНЫЕ КРАЕВЫЕ КЕЙСЫ — ПОБОЧНЫЕ ЗАПИСИ И ОЧИСТКИ
  // =========================================================================

  test('#230: cleanup writes signal inside batch propagates completely after flush', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)
    const b = engine.signal(10)

    let e1Runs = 0
    engine.effect(() => {
      e1Runs++
      const _ = a.value // Е1 зависит строго от а

      return () => {
        // Функция очистки побочно пишет в сигнал b
        b.value = 20
      }
    })

    let e2Runs = 0
    const spyE2 = vi.fn()
    engine.effect(() => {
      e2Runs++
      spyE2(b.value) // Е2 зависит строго от b
    })

    // Стартовый прогрев
    expect(e1Runs).toBe(1)
    expect(e2Runs).toBe(1)
    expect(spyE2).toHaveBeenLastCalledWith(10)
    spyE2.mockClear()

    // Запускаем транзакцию батча
    engine.batch(() => {
      a.value = 1 // Это инвалидирует E1 и ставит его в очередь флуша
    })

    // КРИТИЧЕСКИЙ ИНВАРИАНТ: После закрытия батча, выполнение E1 обязано вызвать cleanup,
    // cleanup запишет 20 в 'b', и планировщик ОБЯЗАН синхронно в этой же фазе выполнить E2!
    expect(e1Runs).toBe(2)
    expect(e2Runs).toBe(2) // Если Е2 промахнулся мимо тика флуша — тест упадет
    expect(spyE2).toHaveBeenLastCalledWith(20)
  })

  test('#242: effect in computed — old inner cleanup completely fires before new evaluation', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    let cleanupCalled = false
    let evalStep = 0

    const c = engine.computed(() => {
      evalStep++

      // Симулируем условное владение эффектом внутри computed
      if (a.value === 0) {
        engine.effect(() => {
          return () => {
            cleanupCalled = true // Этот колбэк обязан сработать ДО шага evalStep === 2
          }
        })
      }
      return a.value
    })

    // Прогреваем computed
    expect(c.value).toBe(0)
    expect(evalStep).toBe(1)

    // Триггерим изменение корня графа
    a.value = 1

    // Вызываем пулл-актуализацию вычисления
    const _ = c.value

    // КРИТИЧЕСКИЙ ИНВАРИАНТ: При переходе computed в новое состояние,
    // старый внутренний cleanup эффекта обязан выполниться СТРОГО ДО начала новой оценки!
    expect(evalStep).toBe(2)
    expect(cleanupCalled).toBe(true)
  })

  // =========================================================================
  // 💎 ГРУППА: АСИММЕТРИЧНЫЕ АЛМАЗНЫЕ ГРАФЫ И СХОДИМОСТЬ
  // =========================================================================

  test('#3: jagged diamond + tails — asymmetry depth evaluate only once', () => {
    const engine = new ReactiveEngineCore()

    const a = engine.signal(0)

    // Левое крыло алмаза (глубина +2)
    const b = engine.computed(() => a.value)
    const d = engine.computed(() => b.value)

    // Правое крыло алмаза (прямая связь, глубина +1)
    const c = engine.computed(() => a.value)

    // Точка схождения алмаза (Fan-In)
    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      return d.value + c.value
    })

    // Хвосты (Fan-Out) на выходе из точки схождения
    let fRuns = 0
    const f = engine.computed(() => {
      fRuns++
      return e.value * 10
    })

    let gRuns = 0
    const g = engine.computed(() => {
      gRuns++
      return e.value + 100
    })

    // Регистрируем эффекты-слушатели для удержания графа в живом состоянии
    const spyF = vi.fn()
    engine.effect(() => spyF(f.value))

    const spyG = vi.fn()
    engine.effect(() => spyG(g.value))

    // Стартовый прогрев графа
    expect(e.value).toBe(0)
    expect(eRuns).toBe(1)
    expect(fRuns).toBe(1)
    expect(gRuns).toBe(1)
    spyF.mockClear()
    spyG.mockClear()

    // ТРИГГЕР МУТАЦИИ: Изменяем корень графа
    a.value = 1

    // Принудительно стягиваем значения хвостов
    expect(f.value).toBe(20) // d(1) + c(1) = e(2) -> f(20)
    expect(g.value).toBe(102) // e(2) + 100 = 102

    // КРИТИЧЕСКИЙ ИНВАРИАНТ ТОПОЛОГИИ (#3):
    // Из-за асимметрии пуш-волна долетает до 'e' с разным лагом.
    // Но канонический pull/push граф обязан пересчитать каждую вершину
    // строго по ОДНОМУ разу, полностью исключая фантомные промежуточные такты!
    expect(eRuns).toBe(2)
    expect(fRuns).toBe(2)
    expect(gRuns).toBe(2)
  })

  test('#3: jagged diamond + tails — integration environment with batching', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // Асимметричный граф (разная топологическая глубина веток)
    const b = engine.computed(() => a.value)
    const d = engine.computed(() => b.value)
    const c = engine.computed(() => a.value)

    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      return d.value + c.value
    })

    let fRuns = 0
    const f = engine.computed(() => {
      fRuns++
      return e.value * 10
    })

    // Удерживаем граф живым через эффект
    engine.effect(() => {
      const _ = f.value
    })

    expect(e.value).toBe(0)
    expect(eRuns).toBe(1)
    expect(fRuns).toBe(1)

    // 🎯 СИМУЛЯЦИЯ СРЕДЫ СЬЮТА: Мутируем корень внутри макро-батча транзакции!
    // Если в ядре версии 2.1.10-beta очистка oldDeps шла ДО оценки fn(),
    // этот батч ломал учет эпох на правой ветке 'c', вызывая тройной пересчет fRuns!
    engine.batch(() => {
      a.value = 1
    })

    // Стягиваем финальное значение
    expect(f.value).toBe(20)

    // КРИТИЧЕСКИЙ МАТЕМАТИЧЕСКИЙ ИНВАРИАНТ:
    // Каждая вершина обязана выполниться строго по ОДНОМУ разу в рамках кадра флуша!
    expect(eRuns).toBe(2)
    expect(fRuns).toBe(2) // Если здесь Received: 3 — значит, регрессия поймана локально!
  })

  test('#3: jagged diamond + tails — value equality cut inside asymmetric layout', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // Левое крыло алмаза (глубина +2)
    const b = engine.computed(() => a.value)
    const d = engine.computed(() => b.value)

    // Правое крыло алмаза (глубина +1).
    // ВНИМАНИЕ: ОНО ВСЕГДА ВОЗВРАЩАЕТ 999 (Value Equality Cut)!
    const c = engine.computed(() => {
      const _ = a.value
      return 999
    })

    // Точка схождения алмаза (Fan-In)
    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      return d.value + c.value
    })

    // Хвост алмаза (Fan-Out)
    let fRuns = 0
    const f = engine.computed(() => {
      fRuns++
      return e.value * 10
    })

    // Удерживаем граф живым через эффект
    engine.effect(() => {
      const _ = f.value
    })

    expect(f.value).toBe(9990) // (0 + 999) * 10
    expect(eRuns).toBe(1)
    expect(fRuns).toBe(1)

    // ТРИГГЕР МУТАЦИИ В БАТЧЕ:
    // Изменяем 'a'. Правая ветка 'c' пересчитается, но вернет тот же самый 999.
    // Если в 2.1.10-beta очистка oldDeps шла ДО оценки fn(), узел 'e' превентивно
    // отпишется от 'c', заблокировав легитимное гашение волны, что вызовет лишний пересчет fRuns!
    engine.batch(() => {
      a.value = 1
    })

    // Стягиваем финальное значение хвоста
    expect(f.value).toBe(10000) // (1 + 999) * 10 = 1000 -> 10000

    // КРИТИЧЕСКИЙ МАТЕМАТИЧЕСКИЙ ИНВАРИАНТ ТЕСТА #3 С САЙТА:
    // Каждая вершина обязана перезапуститься строго по одному разу!
    expect(eRuns).toBe(2)
    expect(fRuns).toBe(2) // 🔴 НА СТАРОМ КОДЕ ЗДЕСЬ БУДЕТ ВЫДАНО 3 ВМЕСТО 2!
  })

  test('#3: jagged diamond + tails — original canonical framework test', () => {
    const engine = new ReactiveEngineCore()
    const a = engine.signal(0)

    // b зависит от a (глубина +1)
    const b = engine.computed(() => a.value)
    // d зависит от b (глубина +2)
    const d = engine.computed(() => b.value)

    // c зависит от a напрямую (глубина +1)
    const c = engine.computed(() => a.value)

    // Точка схождения асимметричного алмаза
    let eRuns = 0
    const e = engine.computed(() => {
      eRuns++
      return d.value + c.value
    })

    // Хвосты на выходе
    let fRuns = 0
    const f = engine.computed(() => {
      fRuns++
      return e.value * 10
    })

    let gRuns = 0
    const g = engine.computed(() => {
      gRuns++
      return e.value + 100
    })

    // В оригинальном тесте #3 эффекты НЕ создаются!
    // Граф вычисляется лениво "по требованию" (Pull-only)
    expect(f.value).toBe(0)
    expect(g.value).toBe(100)
    expect(eRuns).toBe(1)
    expect(fRuns).toBe(1)
    expect(gRuns).toBe(1)

    // МУТАЦИЯ КОРНЯ
    a.value = 1

    // Стягиваем значения хвостов напрямую
    expect(f.value).toBe(20) // d(1) + c(1) = e(2) -> f(20)
    expect(g.value).toBe(102) // e(2) + 100 = 102

    // КРИТИЧЕСКИЙ ИНВАРИАНТ СЬЮТА С САЙТА:
    // Без удержания эффектами, при превентивном выжигании oldDeps в 2.1.10-beta
    // узел 'e' отписывался от 'c'. На пулл-фазе правая ветка засыпала,
    // ломая маркер версий, из-за чего fRuns и gRuns перезапускались ложно по 2 раза подряд!
    expect(eRuns).toBe(2)
    expect(fRuns).toBe(2) // 🔴 НА СТАРОМ КОДЕ ЗДЕСЬ БУДЕТ ВЫДАНО 3 ВМЕСТО 2!
    expect(gRuns).toBe(2)
  })

})
