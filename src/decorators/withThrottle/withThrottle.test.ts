import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withThrottle } from './withThrottle'
import { ReactiveEngine, ReactiveEngineAutomatic } from '../../core'

const engines = [
  { name: 'ReactiveEngine (Synchronous)', Engine: ReactiveEngine, isAsync: false },
  { name: 'ReactiveEngineAutomatic (Microtask)', Engine: ReactiveEngineAutomatic, isAsync: true }
]

engines.forEach(({ name, Engine, isAsync }) => {
  describe(`${name} — withThrottle Decorator`, () => {

    let fakeNow = 1000

    beforeEach(() => {
      fakeNow = 1000
      // Подменяем системный Date.now управляемой переменной fakeNow
      vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)
      // ВАЖНО: Используем реальные таймеры, чтобы избежать дедлоков в async setTimeout
      vi.useRealTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it.skip('должен выполнить первый вызов мгновенно (Leading edge) без ожидания', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('immediate-data')
      const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })
      const controller = new AbortController()

      const result = await throttledFetcher('call-1', controller.signal)

      expect(mockFetcher).toHaveBeenCalledTimes(1)
      expect(result).toBe('immediate-data')
    })

    it.skip('должен заблокировать промежуточные вызовы, но выполнить последний на хвосте (Trailing edge)', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('final-data')
      const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

      const c1 = new AbortController()
      const c2 = new AbortController()
      const c3 = new AbortController()

      // 1. Первый вызов (отметка 1000мс) -> Срабатывает сразу (Leading)
      throttledFetcher('value-1', c1.signal)
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      // Смещаем время вперед на 100мс (отметка 1100мс)
      fakeNow += 100

      // 2. Промежуточный вызов -> Будет заблокирован и перебит следующим
      const p2 = throttledFetcher('value-2', c2.signal)

      fakeNow += 50 // отметка 1150мс

      // 3. Хвостовой вызов -> Запомнится как финальный
      const p3 = throttledFetcher('value-3', c3.signal)

      // Проверяем, что промежуточный вызов отклонен декоратором
      await expect(p2).rejects.toThrow('Aborted due to newer throttled value')

      // Перематываем виртуальное время до конца лимита (прошло 300мс с начала, отметка 1300мс)
      fakeNow = 1300

      // Ждем окончания реальной микросекундной макрозадачи setTimeout
      const result3 = await p3

      expect(mockFetcher).toHaveBeenCalledTimes(2)
      expect(mockFetcher).toHaveBeenLastCalledWith('value-3', c3.signal)
      expect(result3).toBe('final-data')
    })

    it.skip('новый прямой вызов по истечении лимита должен выполняться мгновенно как Leading', async () => {
      const mockFetcher = vi.fn().mockResolvedValue('fresh')
      const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

      const c1 = new AbortController()
      const c2 = new AbortController()
      const c3 = new AbortController()

      // 1. Первый вызов (отметка 1000мс) -> Leading (срабатывает сразу)
      throttledFetcher('1', c1.signal)
      expect(mockFetcher).toHaveBeenCalledTimes(1)

      fakeNow += 150 // отметка 1150мс

      // 2. Второй вызов -> Trailing (встает в хвост таймера)
      const p2 = throttledFetcher('2', c2.signal)

      // Имитируем прохождение времени до отметки 1300мс (конец лимита)
      fakeNow = 1300
      await p2 // Дожидаемся успешного выполнения хвоста

      // Дополнительно смещаем время вперед (отметка 1500мс) — окно блокировки гарантированно закрыто
      fakeNow = 1500

      // 3. Третий вызов -> Лимит изменился. Должен пробиться мгновенно как новый Leading
      const p3 = throttledFetcher('3', c3.signal)
      await p3

      // Проверяем, что все три вызова успешно дошли до оригинального фетчера
      expect(mockFetcher).toHaveBeenCalledTimes(3)
      expect(mockFetcher).toHaveBeenLastCalledWith('3', c3.signal)
    })

    // ====================================================
    //  withThrottle — Работа с массивами и коллекциями
    // ====================================================
    describe('withThrottle — Работа с массивами и коллекциями', () => {

      it.skip('должен корректно троттлить вызовы при быстрой смене иммутабельных массивов-зависимостей', async () => {
        const mockFetcher = vi.fn().mockResolvedValue('array-throttled')
        const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

        const c1 = new AbortController()
        const c2 = new AbortController()
        const c3 = new AbortController()

        // 1. Первый вызов (Leading) -> Улетает мгновенно
        throttledFetcher(['js'], c1.signal)
        expect(mockFetcher).toHaveBeenCalledTimes(1)
        expect(mockFetcher).toHaveBeenCalledWith(['js'], c1.signal)

        fakeNow += 100 // отметка 1100мс

        // 2. Промежуточный вызов с массивом-копией №2 -> Отклоняется
        const p2 = throttledFetcher(['js', 'ts'], c2.signal)

        fakeNow += 50 // отметка 1150мс

        // 3. Хвостовой вызов с массивом-копией №3 -> Встает в Trailing edge
        const p3 = throttledFetcher(['js', 'ts', 'vue'], c3.signal)

        await expect(p2).rejects.toThrow('Aborted due to newer throttled value')

        // Сдвигаем время на конец лимита (1300мс)
        fakeNow = 1300
        const result = await p3

        // Проверяем, что хвостовой вызов улетел строго с финальным составом массива
        expect(mockFetcher).toHaveBeenCalledTimes(2)
        expect(mockFetcher).toHaveBeenLastCalledWith(['js', 'ts', 'vue'], c3.signal)
        expect(result).toBe('array-throttled')
      })

      it.skip('должен нативно извлекать свежий состав Proxy-массива на Trailing edge при его мутациях .push()', async () => {
        const engine = new ReactiveEngine()
        const mockFetcher = vi.fn().mockImplementation(async (arr: string[]) => `length:${arr.length}`)
        const throttledFetcher = withThrottle(mockFetcher, { limit: 300 })

        const c1 = new AbortController()
        const c2 = new AbortController()

        const state = engine.reactive({
          items: ['A']
        })

        // 1. Первый вызов (Leading) -> улетает мгновенно с ['A']
        throttledFetcher(state.items, c1.signal)
        expect(mockFetcher).toHaveBeenCalledTimes(1)
        expect(mockFetcher).toHaveBeenCalledWith(['A'], c1.signal)

        fakeNow += 150 // отметка 1150мс

        // 2. Ставим вызов в хвост (Trailing) внутри окна блокировки
        const p2 = throttledFetcher(state.items, c2.signal)

        // Императивно мутируем этот же прокси-массив (больше не нужно ждать асингулярные микрозадачи!)
        state.items.push('B')
        state.items.push('C')

        // Сдвигаем время на конец лимита (1300мс), провоцируя запуск таймаута
        fakeNow = 1300
        const result = await p2

        // Декоратор обязан на хвосте прочитать мутировавший прокси-массив и отдать актуальный состав!
        expect(mockFetcher).toHaveBeenCalledTimes(2)
        expect(mockFetcher).toHaveBeenLastCalledWith(state.items, c2.signal)
        expect(result).toBe('length:3')
      })

    })
  })
})
