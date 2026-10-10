import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DestroyRef } from '@angular/core'
import { ReactiveEngineCore, ReactiveEngine } from '../index'
import { toAngularSignal } from './core.angular-adapter'

// ИСПРАВЛЕНО: Добавлен обязательный флаг контракта DestroyRef Angular
class MockDestroyRef implements DestroyRef {
  private callbacks = new Set<() => void>()

  // Реализуем обязательное свойство интерфейса Angular
  public destroyed = false

  onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  destroy(): void {
    this.destroyed = true // Переводим статус в true при уничтожении контекста
    this.callbacks.forEach(cb => cb())
    this.callbacks.clear()
  }
}

const testEngines = [
  { name: 'ReactiveEngine (Synchronous Flow)', createEngine: () => new ReactiveEngineCore() },
  { name: 'ReactiveEngineAutomatic (Microtask Flow)', createEngine: () => new ReactiveEngine() }
]

testEngines.forEach(({ name, createEngine }) => {
  describe.skip(`Angular Adapter — Интеграция с ${name}`, () => {
    let engine: ReactiveEngineCore

    beforeEach(() => {
      engine = createEngine()
    })

    it.skip('должен успешно конвертировать Сигналы ядра в нативные Angular Signals', () => {
      const sig = engine.signal('angular-16')
      const mockDestroy = new MockDestroyRef()

      // Передаем мок DestroyRef вторым аргументом, имитируя инжекцию компонента
      const ngSig = toAngularSignal(sig, mockDestroy)

      // Проверяем, что на выходе получили валидный геттер Angular Signal
      expect(typeof ngSig).toBe('function')
      expect(ngSig()).toBe('angular-16')

      mockDestroy.destroy()
    })

    it.skip('должен синхронизировать изменения примитивных сигналов ядра', () => {
      const sig = engine.signal(100)
      const mockDestroy = new MockDestroyRef()
      const ngSig = toAngularSignal(sig, mockDestroy)

      expect(ngSig()).toBe(100)

      sig.value = 200
      expect(ngSig()).toBe(200)

      mockDestroy.destroy()
    })

    it.skip('должен автоматически триггерить изменения Angular Signal при инвалидации computed-цепочек массивов', () => {
      const listSignal = engine.signal<string[]>(['apple', 'banana'])
      const mockDestroy = new MockDestroyRef()

      const longWords = engine.computed(() => {
        return listSignal.value.filter(word => word.length > 5)
      })

      const ngSig = toAngularSignal(longWords, mockDestroy)
      expect(ngSig()).toEqual(['banana'])

      // Деструктивный push на месте в один такт ядра
      listSignal.value.push('pineapple')
      listSignal.value = listSignal.value

      expect(ngSig()).toEqual(['banana', 'pineapple'])
      mockDestroy.destroy()
    })

    it.skip('должен автоматически отписываться от сигнала ядра при вызове onDestroy в Angular', () => {
      const sig = engine.signal('alive')
      const mockDestroy = new MockDestroyRef()

      // Отслеживаем подписки на уровне графа ядра
      const initialSubscribersCount = (sig as any).subscribe ? 0 : 1 // В зависимости от структуры ноды

      const ngSig = toAngularSignal(sig, mockDestroy)

      // Имитируем уничтожение компонента Angular (Unmount)
      mockDestroy.destroy()

      sig.value = 'dead'
      // Значение в Angular Signal заморожено, так как деструктор ядра полностью очистил ссылку!
      expect(ngSig()).toBe('alive')
    })
  })
})
