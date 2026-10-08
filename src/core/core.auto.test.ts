import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveEngineAutomatic } from './core'

describe('ReactiveEngineAutomatic — Аппаратный автобатчинг микрозадач', () => {
  let engine: ReactiveEngineAutomatic

  beforeEach(() => {
    engine = new ReactiveEngineAutomatic()
  })

  it('должен АВТОМАТИЧЕСКИ склеивать множественные мутации сигналов без ручного вызова engine.batch()', async () => {
    const sig1 = engine.signal(1)
    const sig2 = engine.signal(10)
    const spy = vi.fn()

    engine.effect(() => {
      spy(sig1.value, sig2.value)
    })
    spy.mockClear()

    // Имитируем обычный синхронный код или асинхронный блок после await fetch()
    // Обрати внимание: мы НЕ пишем тут engine.batch()!
    sig1.value = 2
    sig2.value = 20

    // Так как движок асинхронный, прямо сейчас эффект еще НЕ сработал вхолостую
    expect(spy).not.toHaveBeenCalled()

    // Прокручиваем ровно 1 шаг Event Loop (выход в микрозадачу)
    await Promise.resolve()

    // Эффект проснулся ровно ОДИН раз и сразу с финальными консистентными данными!
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(2, 20)
  })

  it('должен автоматически склеивать нативные мутации Proxy-массивов в 1 тик Event Loop', async () => {
    const state = engine.reactive({ list: ['item1'] })
    const spy = vi.fn()

    engine.effect(() => {
      spy(state.list.join(', '))
    })
    spy.mockClear()

    // Делаем три деструктивные мутации Proxy-массива подряд в голом коде
    state.list.push('item2')
    state.list.push('item3')
    state.list.splice(1, 1) // удалили 'item2'

    // В синхронном ядре тут уже набежало бы 3 ререндера. Но автоматический шедулер молчит!
    expect(spy).not.toHaveBeenCalled()

    // Дожидаемся окончания текущего макротаска Node.js
    await Promise.resolve()

    // Эффект сработал ровно 1 раз для итогового состояния массива!
    expect(spy).toHaveBeenCalledTimes(1)
    expect(state.list).toEqual(['item1', 'item3'])
  })
})
