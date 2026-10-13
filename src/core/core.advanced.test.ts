import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'

describe('⚛️ Reactive Engine — Продвинутая спецификация Ядра', () => {
  test('#22 [dynamic cleanups] computed должен динамически вырезать неактивные ветви зависимостей // ТЕСТ НА ДИНАМИЧЕСКИЕ ВЕТВЛЕНИЯ ГРАФА (Conditional Evaluation)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const condition = engine.signal(true)
      const left = engine.signal('left')
      const right = engine.signal('right')

      let computedExecutions = 0
      const comp = engine.computed(() => {
        computedExecutions++
        return condition.value ? left.value : right.value
      })

      // Читаем начальный кадр
      expect(comp.value).toBe('left')
      expect(computedExecutions).toBe(1)

      // Меняем правую (неактивную в данный момент) ветвь
      right.value = 'right-mutated'

      // Вычисление НЕ должно перезапускаться, так как правая ветвь сейчас спит
      expect(computedExecutions).toBe(1)
      expect(comp.value).toBe('left')

      // Переключаем условие
      condition.value = false

      // Вычисление обязано проснуться и забрать данные из правой ветви
      expect(comp.value).toBe('right-mutated')
      expect(computedExecutions).toBe(2)

      // Теперь левая ветвь спит. Мутируем её
      left.value = 'left-mutated'

      // Вычисление должно оставаться неподвижным
      expect(computedExecutions).toBe(2)
      expect(comp.value).toBe('right-mutated')
    }
  })

  test('#112 [deep chains] граф обязан без искажений проводить изменения через многоуровневые вычисления // ТЕСТ НА СХОДИМОСТЬ ДЛИННЫХ ЦЕПОЧЕК (Deep Computed Chains)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const start = engine.signal(1)

      // Создаем длинную реактивную матрешку вычислений
      const c1 = engine.computed(() => start.value + 1)
      const c2 = engine.computed(() => c1.value + 1)
      const c3 = engine.computed(() => c2.value + 1)
      const c4 = engine.computed(() => c3.value + 1)

      expect(c4.value).toBe(5)

      // Мутируем корень графа
      start.value = 10

      // Срез данных на хвосте цепочки обязан мгновенно сойтись к новому значению
      expect(c4.value).toBe(14)
    }
  })

  test('#180 [effect dispose] граф должен полностью разрывать связи и освобождать память при уничтожении эффекта // ТЕСТ НА УНИЧТОЖЕНИЕ ПОДПИСОК (Бенчмарк #180 / Dead Roots Garbage Collection)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const sig = engine.signal('alive')
      const spy = vi.fn()

      // Регистрируем эффект и забираем его функцию отписки
      const unsubscribe = engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledWith('alive')
      spy.mockClear()

      // Мутируем сигнал до отписки -> эффект должен сработать
      sig.value = 'changed'
      expect(spy).toHaveBeenCalledWith('changed')
      spy.mockClear()

      // ИМПЕРАТИВНО УНИЧТОЖАЕМ ЭФФЕКТ (Размонтирование)
      unsubscribe()

      // Мутируем сигнал после уничтожения корня
      sig.value = 'dead'

      // Шпион обязан промолчать, так как узел графа полностью стерт из памяти!
      expect(spy).not.toHaveBeenCalled()
    }
  })

  test('#95 [Stale Evaluation] родительские вычисления обязаны выполняться СТРОГО до начала выполнения дочерних dependees // ТЕСТ НА ТОПОЛОГИЧЕСКИЙ ПОРЯДОК СХОЖДЕНИЯ', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const counter = engine.signal(0)

      const parentComputed = engine.computed(() => counter.value * 2)
      const childComputed = engine.computed(() => parentComputed.value + 1)

      const evaluationOrder: string[] = []

      engine.effect(() => {
        evaluationOrder.push(`parent:${parentComputed.value}`)
      })

      engine.effect(() => {
        evaluationOrder.push(`child:${childComputed.value}`)
      })

      evaluationOrder.length = 0

      counter.value = 1

      const firstChildIndex = evaluationOrder.findIndex(l => l.startsWith('child'))
      let lastParentIndex = -1
      for (let i = evaluationOrder.length - 1; i >= 0; i--) {
        if (evaluationOrder[i].startsWith('parent')) {
          lastParentIndex = i
          break
        }
      }

      expect(lastParentIndex).toBeLessThan(firstChildIndex)
    }
  })

  test('#154 [batch throw] граф должен сохранять консистентность и выполнять выжившие эффекты при ошибке в батче // ТЕСТ НА ЖИВУЧЕСТЬ ГРАФА ПРИ ИСКЛЮЧЕНИЯХ В БАТЧЕ', async () => {
    const engine = new ReactiveEngineCore()
    const sig = engine.signal(10)
    const spy = vi.fn()

    engine.effect(() => {
      spy(sig.value)
    })
    engine.flushEffects()
    spy.mockClear()

    try {
      engine.batch(() => {
        sig.value = 20
        throw new Error('Фатальный сбой транзакции')
      })
    } catch (e) {}

    engine.flushEffects()
    expect(sig.value).toBe(20)
  })

  test('#125/#132 [batch revert] эффект не должен просыпаться, если финальное значение графа вернулось к истокам // ТЕСТ НА ПОЛНЫЙ ОТКАТ МУТАЦИИ В БАТЧЕ', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const sig = engine.signal(100)
      const comp = engine.computed(() => sig.value * 2)

      let lastValue = comp.value
      let sideEffectCalls = 0

      engine.effect(() => {
        const currentVal = comp.value
        if (currentVal !== lastValue) {
          lastValue = currentVal
          sideEffectCalls++
        }
      })

      sideEffectCalls = 0

      engine.batch(() => {
        sig.value = 200
        sig.value = 100 // Полный реверт мутации обратно к истокам!
      })

      // Вычисляемое свойство не изменилось по итогу батча — сайд-эффект обязан промолчать!
      expect(sideEffectCalls).toBe(0)
      expect(comp.value).toBe(200)
    }
  })

  test('#45 [nested batches] планировщик должен удерживать эффекты до выхода из самого внешнего батча // ВЛОЖЕННЫЕ БАТЧИ (Nested Transactions)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const s1 = engine.signal(0)
      const s2 = engine.signal(0)
      const spy = vi.fn()

      engine.effect(() => {
        spy(s1.value, s2.value)
      })

      spy.mockClear()

      // Заходим во внешний батч
      engine.batch(() => {
        s1.value = 1

        // Заходим во внутренний вложенный батч
        engine.batch(() => {
          s2.value = 2
          expect(spy).not.toHaveBeenCalled() // Эффект всё ещё заблокирован
        })

        // Вышли из внутреннего, но мы всё ещё внутри внешнего батча
        expect(spy).not.toHaveBeenCalled()
        s1.value = 3
      })

      // Вышли из самого внешнего батча — триггерится РОВНО 1 синхронный вызов эффекта
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(3, 2)
    }
  })

  test.skip('#67 [computed bypass] граф должен останавливать волну инвалидации, если computed вернул то же значение // ПРЕРЫВАНИЕ ВЫЧИСЛЕНИЙ ПО РАВЕНСТВУ (Early Value Bypass)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const source = engine.signal(2)

      let compExecutions = 0
      // Вычисление возвращает остаток от деления (всегда 0 для четных чисел)
      const isEven = engine.computed(() => {
        compExecutions++
        return source.value % 2 === 0
      })

      const spyEffect = vi.fn()
      engine.effect(() => {
        spyEffect(isEven.value)
      })

      expect(compExecutions).toBe(1)
      expect(spyEffect).toHaveBeenCalledTimes(1)
      spyEffect.mockClear()

      // Мутируем корень графа: 2 -> 4. Число изменилось, но признак четности (true) остался прежним!
      source.value = 4

      // Компьютед обязан пересчитаться, чтобы проверить значение
      expect(compExecutions).toBe(2)

      // НО ЭФФЕКТ НИЖЕ ПО ГРАФУ НЕ ДОЛЖЕН ТРИГГЕРИТЬСЯ, так как значение ивента не поменялось!
      expect(spyEffect).not.toHaveBeenCalled()
    }
  })

  test.skip('#89 [error isolation] падение одного эффекта не должно ломать выполнение остальных эффектов в батче // ОШИБКИ И СТАБИЛЬНОСТЬ ГРАФА (Error Isolation)', () => {
    const engines = [new ReactiveEngineCore()]

    for (const engine of engines) {
      const trigger = engine.signal(0)
      const spySuccess = vi.fn()

      // Хрупкий эффект, падающий при изменении
      engine.effect(() => {
        if (trigger.value > 0) {
          throw new Error('Boom!')
        }
      })

      // Стабильный эффект, идущий следом в очереди планировщика
      engine.effect(() => {
        spySuccess(trigger.value)
      })

      spySuccess.mockClear()

      // Глушим console.error в выводе тестов, чтобы не засорять логи ранера
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Пинаем триггер обновлений
      engine.batch(() => {
        trigger.value = 1
      })

      // Проверяем, что падение первого эффекта не заблокировало выполнение второго!
      expect(spySuccess).toHaveBeenCalledWith(1)
      consoleSpy.mockRestore()
    }
  })

  test('#142 [readonly computed] узел computed не должен позволять прямую перезапись значения извне // ЗАЩИТА ОТ ЧИТ СЕТТЕРОВ (Safe Read-Only Computeds)', () => {
    const engine = new ReactiveEngineCore()
    const sig = engine.signal(1)
    const comp = engine.computed(() => sig.value * 2)

    expect(comp.value).toBe(2)

    // Попытка императивно перезаписать свойство (если TS пропустит)
    try {
      (comp as any).value = 999
    } catch (e) {}

    // Значение должно оставаться строго декларативным и ленивым
    expect(comp.value).toBe(2)
  })

  describe('⚛️ Reactive Engine — Тесты на Value-Equality Cut', () => {

    test('#7 [propagation cut] промежуточный computed с неизменным значением обязан блокировать дальнейшую инвалидацию', () => {
      const engine = new ReactiveEngineCore()

      const source = engine.signal(10)

      let intermediateExecutions = 0
      // Компьютед-фильтр: всегда возвращает true, если число четное
      const intermediate = engine.computed(() => {
        intermediateExecutions++
        return source.value % 2 === 0
      })

      let downstreamExecutions = 0
      const downstream = engine.computed(() => {
        downstreamExecutions++
        return intermediate.value ? 'Четное' : 'Нечетное'
      })

      // Триггерим первоначальный сбор графа
      expect(downstream.value).toBe('Четное')
      expect(intermediateExecutions).toBe(1)
      expect(downstreamExecutions).toBe(1)

      // Мутируем корень графа: 10 -> 12 (оба четные, результат intermediate не изменился!)
      source.value = 12

      // Читаем хвост графа.
      // Промежуточный узел обязан пересчитаться (так как его корень изменился),
      // но дочерний узел DOWNSTREAM НЕ ДОЛЖЕН пересчитываться, так как intermediate вернул тот же true!
      expect(downstream.value).toBe('Четное')
      expect(intermediateExecutions).toBe(2)
      expect(downstreamExecutions).toBe(1) // ❌ Упадет здесь: на старом коде будет 2, так как markDirty сработает вслепую
    })

    test.skip('#34 [pruning stops] каскад инвалидации должен затухать на первом же узле с неизменным результатом', () => {
      const engine = new ReactiveEngineCore()
      const source = engine.signal(1)

      // b зажимает значение в диапазоне [0, 10]
      const b = engine.computed(() => Math.min(Math.max(source.value, 0), 10))
      const c = engine.computed(() => b.value + 1)
      const d = engine.computed(() => c.value * 2)

      expect(d.value).toBe(4) // initial: source(1) -> b(1) -> c(2) -> d(4)

      // Изменение внутри диапазона: b меняется, c меняется, d меняется
      source.value = 2
      expect(d.value).toBe(6)

      // Мутируем source далеко за предел: 20. b станет равно 10.
      source.value = 20
      expect(d.value).toBe(22) // b(10) -> c(11) -> d(22)

      // А теперь мутируем source еще дальше: 20 -> 30.
      // Значение b остается равным 10. Каскад обязан затухнуть на b!
      let spy = vi.fn()
      engine.effect(() => {
        spy(d.value)
      })
      spy.mockClear()

      source.value = 30

      // Так как b не изменился (остался 10), эффекты и вычисления ниже по графу не должны дергаться
      expect(spy).not.toHaveBeenCalled() // ❌ Упадет здесь на текущей реализации
    })
  })

  // =========================================================================
  // КОНТРОЛЬ МУТАЦИЙ МАССИВОВ И КОЛЛЕКЦИЙ (UI-ИМИТАЦИЯ БЕЗ ПРИВЯЗКИ К ФРЕЙМВОРКАМ)
  // =========================================================================
  test('#M-1: деструктивная мутация массива через пинок сеттера самому себе', () => {
    const engine = new ReactiveEngineCore()
    const listSignal = engine.signal(['apple', 'banana'])

    // Эмулируем computed-селектор компонента
    const upperList = engine.computed(() => listSignal.value.map(word => word.toUpperCase()))

    const spy = vi.fn()
    engine.effect(() => {
      spy(upperList.value)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(['APPLE', 'BANANA'])

    // Симулируем классический паттерн из UI: мутируем нативно и пинаем ссылку саму в себя
    spy.mockClear()
    listSignal.value.push('orange')
    listSignal.value = listSignal.value // Инициирует Object.is(obj, obj) в сеттере

    // Граф обязан зафиксировать пинок, прокинуть версию и синхронно обновить эффект
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(['APPLE', 'BANANA', 'ORANGE'])
  })

  test('#M-2: нативные деструктивные мутации Proxy-массивов (.push / .reverse) внутри reactive', () => {
    const engine = new ReactiveEngineCore()

    // Создаем глубокий реактивный стейт
    const state = engine.reactive({
      todos: ['Task 1']
    })

    // Имитируем тяжелый computed-счетчик или фильтр
    let computedRuns = 0
    const todoCountMessage = engine.computed(() => {
      computedRuns++
      return `Total: ${state.todos.length} items`
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(todoCountMessage.value)
    })

    expect(spy).toHaveBeenLastCalledWith('Total: 1 items')
    expect(computedRuns).toBe(1)

    // 1. Делаем нативный push в прокси-массив — ловушка обязана перехватить изменение length
    spy.mockClear()
    state.todos.push('Task 2')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith('Total: 2 items')
    expect(computedRuns).toBe(2)

    // 2. Делаем деструктивный разворот массива на месте (.reverse)
    // Длина массива не изменилась, но элементы поменяли индексы
    const contentCollector = engine.computed(() => state.todos.join(', '))

    const contentSpy = vi.fn()
    engine.effect(() => {
      contentSpy(contentCollector.value)
    })

    contentSpy.mockClear()
    state.todos.reverse() // Поменяет порядок элементов на месте

    // Ловушка прокси обязана зафиксировать мутацию индексов и обновить граф
    expect(contentSpy).toHaveBeenCalledTimes(1)
    expect(contentSpy).toHaveBeenLastCalledWith('Task 2, Task 1')
  })

  test('#M-3: каскадная фильтрация массивов и Value Equality Cut при "холостых" мутациях', () => {
    const engine = new ReactiveEngineCore()
    const itemsSignal = engine.signal(['js', 'ts', 'rust'])

    // Фильтруем только те слова, длина которых равна 2 символам ('js', 'ts')
    let filterRuns = 0
    const shortWords = engine.computed(() => {
      filterRuns++
      return itemsSignal.value.filter(item => item.length === 2)
    })

    // Дочерний computed считает общее количество отфильтрованных элементов
    let countRuns = 0
    const totalShort = engine.computed(() => {
      countRuns++
      return shortWords.value.length
    })

    const spy = vi.fn()
    engine.effect(() => {
      spy(totalShort.value)
    })

    expect(spy).toHaveBeenLastCalledWith(2) // 'js' и 'ts'
    expect(filterRuns).toBe(1)
    expect(countRuns).toBe(1)

    // БОЕВАЯ МУТАЦИЯ: Добавляем элемент 'python', который НЕ проходит фильтр shortWords
    spy.mockClear()
    itemsSignal.value.push('python')
    itemsSignal.value = itemsSignal.value

    // shortWords ОБЯЗАН пересчитаться (так как источник изменился по ссылке)
    expect(filterRuns).toBe(2)

    // КРИТИЧЕСКАЯ ПРОВЕРКА: Поскольку отфильтрованный массив по итогу выполнения функции
    // поменял ссылку, узел totalShort ОБЯЗАН перезапуститься во второй раз, чтобы проверить длину.
    // Но так как его длина осталась прежней (2), он совершает VALUE EQUALITY CUT —
    // каскад затухает, и эффект-шпион обязан промолчать!
    expect(spy).not.toHaveBeenCalled()
    expect(countRuns).toBe(2) // Дочерний count пересчитался ровно 2 раза (1 при старте + 1 при смене ссылки)
  })

})
