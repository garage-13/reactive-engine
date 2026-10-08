import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngine } from './core'

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine

  beforeEach(() => {
    engine = new ReactiveEngine()
  })

  describe('Signals & Effects', () => {
    it('должен сохранять начальное значение и обновлять его при записи', () => {
      const sig = engine.signal(10)
      expect(sig.value).toBe(10)

      sig.value = 20
      expect(sig.value).toBe(20)
    })

    it('должен автоматически запускать эффект при изменении сигнала', async () => {
      const sig = engine.signal('initial')
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('initial')

      sig.value = 'updated'

      // Ждем выполнения отложенного микрозадачей эффекта
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy).toHaveBeenCalledWith('updated')
    })

    it('не должен триггерить эффект, если устанавливается идентичное значение', () => {
      const sig = engine.signal(42)
      const spy = vi.fn()

      engine.effect(() => {
        spy(sig.value)
      })

      spy.mockClear()
      sig.value = 42 // Значение не изменилось
      expect(spy).not.toHaveBeenCalled()
    })

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта', async () => {
      const sig = engine.signal(1)
      const cleanupSpy = vi.fn()

      const unsubscribe = engine.effect(() => {
        const val = sig.value
        return () => cleanupSpy(val)
      })

      expect(cleanupSpy).not.toHaveBeenCalled()

      sig.value = 2 // Перезапуск эффекта отложен

      // Ждем выполнения микрозадачи
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
      expect(cleanupSpy).toHaveBeenCalledWith(1)

      unsubscribe() // Ручная отписка происходит синхронно
      expect(cleanupSpy).toHaveBeenCalledTimes(2)
      expect(cleanupSpy).toHaveBeenCalledWith(2)
    })


    it('должен поддерживать валидацию значений сигнала', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const sig = engine.signal(10, {
        validate: (val) => val > 0 || 'Число должно быть больше 0',
      })

      sig.value = -5 // Невалидное значение
      expect(sig.value).toBe(10) // Значение не изменилось
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('должен нативно отслеживать мутации массивов внутри Сигнала через .push() без смены ссылок', async () => {
      const engine = new ReactiveEngine()

      // Создаем сигнал с массивом
      const tagsSignal = engine.signal(['javascript'])
      const spy = vi.fn()

      engine.effect(() => {
        spy(tagsSignal.value.join(', '))
      })

      expect(spy).toHaveBeenCalledWith('javascript')
      spy.mockClear()

      // 1. ДЕЛАЕМ НАВАТИВНУЮ МУТАЦИЮ МАССИВА!
      tagsSignal.value.push('typescript')

      // 2. Принудительно пинаем сеттер сигнала, чтобы он прогнал граф обновлений.
      // Благодаря фиксу ядра, проверка на примитив пропустит операцию, несмотря на идентичность ссылки!
      tagsSignal.value = tagsSignal.value

      await new Promise<void>((r) => queueMicrotask(r))

      // Проверяем: теперь эффект сработал честно ровно 1 раз, мутабельный стиль восстановлен!
      expect(spy).toHaveBeenCalledWith('javascript, typescript')
      expect(spy).toHaveBeenCalledTimes(1)
    })

    describe('Мутабельная работа с массивами в Сигналах', () => {

      it('должен отслеживать нативное добавление элементов через .push() и длину .length в Сигнале при пинке сеттера', async () => {
        const engine = new ReactiveEngine()
        const tagsSignal = engine.signal(['js'])
        const spy = vi.fn()

        engine.effect(() => {
        // Подписываемся на длину массива внутри сигнала
          spy(tagsSignal.value.length)
        })

        expect(spy).toHaveBeenCalledWith(1)
        spy.mockClear()

        // ИМПЕРАТИВНАЯ МУТАЦИЯ: Больше никакого spread-оператора!
        tagsSignal.value.push('ts')

        // Пинаем сеттер сигнала самому себе, чтобы спровоцировать проход графа.
        // Благодаря нашему фиксу, ядро пропустит эту операцию, несмотря на ту же ссылку.
        tagsSignal.value = tagsSignal.value

        await new Promise<void>((r) => queueMicrotask(r))

        // Проверяем: длина стала 2, эффект сработал ровно 1 раз
        expect(spy).toHaveBeenCalledWith(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('должен отслеживать удаление элементов из Сигнала через .splice()', async () => {
        const engine = new ReactiveEngine()
        const listSignal = engine.signal(['apple', 'banana', 'orange'])
        const spy = vi.fn()

        engine.effect(() => {
          spy(listSignal.value.length)
        })

        expect(spy).toHaveBeenCalledWith(3)
        spy.mockClear()

        // Вырезаем 'banana' нативно
        listSignal.value.splice(1, 1)

        // Пинаем сеттер
        listSignal.value = listSignal.value

        await new Promise<void>((r) => queueMicrotask(r))

        expect(spy).toHaveBeenCalledWith(2)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(listSignal.value).toEqual(['apple', 'orange'])
      })

      it('должен отслеживать изменение порядка элементов в Сигнале через .reverse() без смены длины', async () => {
        const engine = new ReactiveEngine()
        const numbersSignal = engine.signal([1, 2, 3])
        const spy = vi.fn()

        engine.effect(() => {
        // Подписываемся на массив, чтобы проверить перестановку элементов
          spy(numbersSignal.value[0])
        })

        expect(spy).toHaveBeenCalledWith(1)
        spy.mockClear()

        // Разворачиваем массив нативно
        numbersSignal.value.reverse()

        // Пинаем сеттер
        numbersSignal.value = numbersSignal.value

        await new Promise<void>((r) => queueMicrotask(r))

        // Проверяем: первый элемент стал 3, граф успешно проснулся
        expect(spy).toHaveBeenCalledWith(3)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('должен корректно интегрировать Сигналы с массивами в циклы перебора .map()', async () => {
        const engine = new ReactiveEngine()
        const itemsSignal = engine.signal(['A', 'B'])
        const spy = vi.fn()

        engine.effect(() => {
        // Имитируем рендер списка в JSX компонента
          const rendered = itemsSignal.value.map(item => `Item: ${item}`)
          spy(rendered)
        })

        expect(spy).toHaveBeenCalledWith(['Item: A', 'Item: B'])
        spy.mockClear()

        // Добавляем элемент императивно
        itemsSignal.value.push('C')
        itemsSignal.value = itemsSignal.value

        await new Promise<void>((r) => queueMicrotask(r))

        // Проверяем полную пересборку коллекции
        expect(spy).toHaveBeenCalledWith(['Item: A', 'Item: B', 'Item: C'])
        expect(spy).toHaveBeenCalledTimes(1)
      })
    })

    describe('Взаимодействие метода effect() с массивами', () => {

      it('КЕЙС 1: должен склеивать множественные нативные мутации массива в один вызов эффекта (автобатчинг)', async () => {
        const engine = new ReactiveEngine()
        const state = engine.reactive({ list: ['A'] })
        const spy = vi.fn()

        engine.effect(() => {
          spy(state.list.join(','))
        })

        spy.mockClear()

        // Делаем три нативные мутации подряд в одном синхронном потоке
        state.list.push('B')
        state.list.push('C')
        state.list.splice(1, 1) // удалили 'B'

        // Проверяем: синхронно эффект еще не сработал (благодаря queueMicrotask)
        expect(spy).not.toHaveBeenCalled()

        // Дожидаемся окончания очереди микрозадач автобатчинга Proxy
        await new Promise<void>((r) => queueMicrotask(r))

        // Эффект сработал честно РОВНО 1 РАЗ для финального состояния!
        expect(spy).toHaveBeenCalledWith('A,C')
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('КЕЙС 2: должен гарантированно вызывать функцию очистки cleanup перед повторным перебором массива', async () => {
        const engine = new ReactiveEngine()
        const state = engine.reactive({ nums: [1, 2] })
        const cleanupSpy = vi.fn()

        engine.effect(() => {
        // Читаем массив
          const _ = state.nums.length

          // Возвращаем колбэк очистки
          return () => {
            cleanupSpy()
          }
        })

        expect(cleanupSpy).not.toHaveBeenCalled()

        // Мутируем массив
        state.nums.push(3)
        await new Promise<void>((r) => queueMicrotask(r))

        // Перед вторым запуском эффекта обязан синхронно сработать cleanup!
        expect(cleanupSpy).toHaveBeenCalledTimes(1)
      })

      it('КЕЙС 3: должен предотвращать бесконечные циклы при мутации этого же массива внутри эффекта', async () => {
        const engine = new ReactiveEngine()
        const state = engine.reactive({ items: [10] })
        const spy = vi.fn()

        engine.effect(() => {
          spy(state.items.length)

          // КРИТИЧЕСКАЯ МУТАЦИЯ: пишем в этот же массив внутри его же эффекта!
          // Благодаря барьеру "if (e === engine.activeEffect) return" в ядре,
          // этот пуш НЕ приведет к бесконечной синхронной рекурсии.
          state.items.push(20)
        })

        // Эффект выполнился первый раз, сделал пуш и безопасно остановился
        expect(spy).toHaveBeenCalledTimes(1)
        expect(state.items).toEqual([10, 20])

        // Даем очиститься микрозадачам, проверяем что рантайм не завис
        await new Promise<void>((r) => queueMicrotask(r))
        expect(spy).toHaveBeenCalledTimes(1) // Счетчик вызовов не ушел в бесконечность
      })

      it('КЕЙС 4: должен намертво глушить подписку на массив после вызова stop() и не реагировать на .reverse()', async () => {
        const engine = new ReactiveEngine()
        const state = engine.reactive({ letters: ['x', 'y', 'z'] })
        const spy = vi.fn()

        const stop = engine.effect(() => {
          spy(state.letters.join(''))
        })

        expect(spy).toHaveBeenCalledWith('xyz')
        spy.mockClear()

        // Вызываем принудительную отписку эффекта от графа
        stop()

        // Разворачиваем массив нативно и мутируем индексы
        state.letters.reverse()
        await new Promise<void>((r) => queueMicrotask(r))

        // УСПЕХ: эффект стерт из allEffects, мертвая подписка проигнорирована
        expect(spy).not.toHaveBeenCalled()
        expect(spy).toHaveBeenCalledTimes(0)
      })

    })

  })
})

/*
Добавь обновления для CHANGELOG для версии `1.7.0`. Я правильно понял, мы полностью закрыли кейс с массивами и можем их мутировать?
*/
