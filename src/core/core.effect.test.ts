import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineCore } from './core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngineCore, isAsync: false }
]

engines.forEach(({ name, Engine }) => {
  describe(`${name} — Синхронные эффекты (Effect Lifecycle & Error Handling)`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = new ReactiveEngineCore()
    })

    it('должен немедленно вызывать эффект при инициализации (Eager Run)', () => {
      const sig = engine.signal(1)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(1)
    })

    it('должен синхронно реагировать на изменение сигналов-зависимостей', () => {
      const sig = engine.signal(10)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      spy.mockClear()
      sig.value = 20

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(20)
    })

    it('должен корректно вызывать функцию очистки (cleanup) перед следующим запуском', () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()
      const effectSpy = vi.fn()

      engine.effect(() => {
        effectSpy(sig.value)
        return () => {
          cleanupSpy(sig.value)
        }
      })

      expect(effectSpy).toHaveBeenCalledWith(1)
      expect(cleanupSpy).not.toHaveBeenCalled()

      // Триггерим повторный запуск
      sig.value = 2

      // Очистка должна вызваться со старым значением ДО выполнения нового тела эффекта
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)
      expect(effectSpy).toHaveBeenCalledWith(2)
    })

    it('должен вызывать cleanup при ручной утилизации эффекта (dispose)', () => {
      const sig = engine.signal(100)
      const cleanupSpy = vi.fn()

      const dispose = engine.effect(() => {
        sig.value
        return cleanupSpy
      })

      expect(cleanupSpy).not.toHaveBeenCalled()

      // Вызываем возвращенную функцию отписки
      dispose()

      expect(cleanupSpy).toHaveBeenCalledTimes(1)

      // Последующие мутации сигнала больше не должны вызывать эффект
      sig.value = 200
      expect(cleanupSpy).toHaveBeenCalledTimes(1) // Счетчик не увеличился
    })

    it('должен каскадно уничтожать вложенные эффекты (Nested Effects Lifecycle — Тесты #209 и #210)', () => {
      const rootSignal = engine.signal(0)
      const innerSignal = engine.signal(10)

      const parentSpy = vi.fn()
      const childSpy = vi.fn()
      const childCleanupSpy = vi.fn()

      // Создаем иерархию эффектов (Родитель -> Ребенок)
      const disposeParent = engine.effect(() => {
        parentSpy(rootSignal.value)

        // Вложенный дочерний эффект, привязанный к контексту activeOwner родителя
        engine.effect(() => {
          childSpy(innerSignal.value)
          return childCleanupSpy
        })
      })

      expect(parentSpy).toHaveBeenCalledTimes(1)
      expect(childSpy).toHaveBeenCalledTimes(1)

      // 1. Проверяем авто-очистку старых детей при перезапуске родителя (Тест #210)
      rootSignal.value = 1
      expect(parentSpy).toHaveBeenCalledTimes(2)
      expect(childCleanupSpy).toHaveBeenCalledTimes(1) // Старый ребенок принудительно зачищен
      expect(childSpy).toHaveBeenCalledTimes(2) // Создан новый ребенок

      // 2. Проверяем каскадное удаление всей ветки при деструктуризации корня (Тест #209)
      disposeParent()
      expect(childCleanupSpy).toHaveBeenCalledTimes(2) // Финальный ребенок тоже уничтожен

      // Убеждаемся, что дочерний эффект стал зомби-безопасным и больше не реагирует на мутации
      innerSignal.value = 999
      expect(childSpy).toHaveBeenCalledTimes(2) // Больше не вызывался
    })

    it('должен беспрепятственно пробрасывать ошибку из функции очистки наверх (Фикс Error Handling)', () => {
      const sig = engine.signal(1)

      engine.effect(() => {
        sig.value
        return () => {
          throw new Error('cleanup error')
        }
      })

      // Изменение сигнала вызовет фазу очистки, которая должна выбросить исключение наружу
      expect(() => {
        sig.value = 2
      }).toThrow('cleanup error')
    })

    it('должен изолировать упавшую очередь и сбрасывать флаги грязи у остальных задач (Тесты #177 и #247)', () => {
      const trigger = engine.signal(0)
      const siblingSpy = vi.fn()

      // Создаем первый эффект, который гарантированно упадет на фазе выполнения или очистки
      engine.effect(() => {
        trigger.value
        if (trigger.value === 1) {
          throw new Error('crash inside effect run')
        }
      })

      // Создаем второй (соседний) эффект на том же уровне глубины графа
      engine.effect(() => {
        trigger.value
        siblingSpy()
      })

      siblingSpy.mockClear()

      // Изменяем сигнал. Первый эффект выбросит исключение в планировщике flushEffects
      expect(() => {
        trigger.value = 1
      }).toThrow('crash inside effect run')

      // Проверяем, что из-за аварийного сброса планировщика задачи изолированы атомарно:
      // Вся оставшаяся грязная очередь текущего тика аннулирована, предотвращая гонку обновлений
      expect(siblingSpy).not.toHaveBeenCalled()
    })

    it('должен группировать вызовы эффектов при использовании пакетных транзакций (Batching)', () => {
      const sigA = engine.signal(1)
      const sigB = engine.signal(10)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sigA.value + sigB.value)
      })

      spy.mockClear()

      // Изменяем несколько сигналов внутри одной транзакции batch()
      engine.batch(() => {
        sigA.value = 2
        sigB.value = 20
      })

      // Вместо двух промежуточных пересчетов, эффект сработал строго 1 раз на выходе из батча
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(22)
    })

    it('должен пробрасывать ошибку очистки наверх БЕЗ вызова console.error (Спецификация Suite #17)', () => {
      const sig = engine.signal(0)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.effect(() => {
        sig.value
        return () => {
          throw new Error('cleanup error')
        }
      })

      // Запись провоцирует вызов деструктора
      expect(() => {
        sig.value = 1
      }).toThrow('cleanup error')

      // ГЛАВНЫЙ ИНВАРИАНТ: Ошибка улетела в ранер, но в консоль ничего не нагажено (stderr чист)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('должен гарантировать выполнение сиблинг-очисток при падении одной из них без логирования в stderr', () => {
      const sig = engine.signal(0)
      const siblingCleanupSpy = vi.fn()
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      engine.effect(() => {
        sig.value

        // Инжектим два деструктора в один и тот же эффект
        const active = (engine as any).activeConsumer
        if (active && active.cleanups) {
          active.cleanups.add(() => { throw new Error('First crash') })
          active.cleanups.add(siblingCleanupSpy)
        }
      })

      // Провоцируем вызов каскада очисток
      expect(() => {
        sig.value = 1
      }).toThrow('First crash')

      // Проверки атомарности:
      expect(siblingCleanupSpy).toHaveBeenCalledTimes(1) // Соседний деструктор успешно отработал
      expect(consoleErrorSpy).not.toHaveBeenCalled()     // Поток stderr остался кристально чистым
      consoleErrorSpy.mockRestore()
    })

    it('TDD #222: эффект, созданный внутри функции очистки другого эффекта, должен корректно отслеживать свои зависимости', () => {
      const sourceA = engine.signal(0)
      const sourceB = engine.signal(100)

      let innerEvaluations = 0

      // Имитируем паттерн дебаунсинга из тест-суита
      engine.effect(() => {
        sourceA.value // Подписываемся на А

        return () => {
          // Внутри очистки создаем новый изолированный эффект
          engine.effect(() => {
            innerEvaluations++
            sourceB.value // Он зависит строго от В
          })
        }
      })

      expect(innerEvaluations).toBe(0) // На старте внутренний эффект еще не создан

      // 1. Провоцируем вызов очистки верхнего уровня
      sourceA.value = 1
      expect(innerEvaluations).toBe(1) // Внутренний эффект создался и сработал 1 раз

      // 2. КРИТИЧЕСКАЯ ПРОВЕРКА: Изменяем зависимость внутреннего эффекта
      sourceB.value = 200
      expect(innerEvaluations).toBe(2) // Внутренний эффект обязан отреагировать!
    })

    it('TDD #229: функция очистки эффекта должна видеть актуальное значение computed при изменении общего корня', () => {
      const source = engine.signal(1)
      const comp = engine.computed(() => source.value * 10)

      const cleanupValues: number[] = []

      engine.effect(() => {
        source.value // Подписка на корень

        return () => {
          // Читаем компьютед внутри деструктора
          cleanupValues.push(comp.value)
        }
      })

      // Изменяем корень. comp должен пересчитаться, а cleanup должен увидеть новое значение
      source.value = 2

      // Согласно каноничной семантике, компьютед должен вернуть свежее 20, а не застрять на 10
      expect(cleanupValues).toEqual([20])
    })

    it('TDD #120: запись в сигнал из функции очистки внутри batch должна атомарно распространяться после flush', () => {
      const trigger = engine.signal(0)
      const sideSignal = engine.signal(10)

      let downstreamRuns = 0

      engine.effect(() => {
        trigger.value
        return () => {
          sideSignal.value = 20 // Побочная запись из деструктора
        }
      })

      engine.effect(() => {
        sideSignal.value // Зависимый эффект
        downstreamRuns++
      })

      downstreamRuns = 0 // Сброс прогрева

      // Запускаем транзакцию
      engine.batch(() => {
        trigger.value = 1
      })

      // На выходе из батча downstream эффект обязан зафиксировать изменение sideSignal
      expect(downstreamRuns).toBe(1)
      expect(sideSignal.value).toBe(20)
    })

  })
})
