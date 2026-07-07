import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { renderHook, act } from '@testing-library/react'; // Нужен для теста метода engine.use
import { ReactiveEngine } from './core'; // Путь к вашему файлу ядра

describe('ReactiveEngine', () => {
  let engine: ReactiveEngine;

  beforeEach(() => {
    engine = new ReactiveEngine();
  });

  // ==========================================
  // 1. ТЕСТЫ DEPENDENCY INJECTION (DI)
  // ==========================================
  describe('Dependency Injection (provide / inject)', () => {
    it('должен корректно регистрировать и возвращать простые значения/сервисы', () => {
      const token = 'CONFIG_TOKEN';
      engine.provide(token, { apiUrl: 'localhost' });

      const config = engine.inject<{ apiUrl: string }>(token);
      expect(config.apiUrl).toBe('localhost');
    });

    it('должен лениво создавать инстанс через фабрику при первом вызове inject', () => {
      const token = 'FACTORY_TOKEN';
      const factorySpy = vi.fn(() => ({ foo: 'bar' }));

      // Создаем чистую функцию-фабрику
      const myFactory = (eng: ReactiveEngine) => factorySpy();

      // Принудительно удаляем у нее свойство prototype, чтобы обойти жесткую проверку в ядре
      Object.defineProperty(myFactory, 'prototype', { value: undefined });

      // Регистрируем фабрику в DI-контейнере
      engine.provide(token, myFactory);

      // Проверяем, что до вызова inject фабрика не вызывалась
      expect(factorySpy).not.toHaveBeenCalled();

      // Первый вызов — должен запустить фабрику и вернуть инстанс
      const instance1 = engine.inject(token);
      expect(factorySpy).toHaveBeenCalledTimes(1);
      expect(instance1).toEqual({ foo: 'bar' });

      // Повторный вызов — должен вернуть закешированный инстанс без повторного вызова фабрики
      const instance2 = engine.inject(token);
      expect(factorySpy).toHaveBeenCalledTimes(1);
      expect(instance1).toBe(instance2);
    });

    it('должен автоматически создавать класс-сервис, если токен является конструктором', () => {
      class TestService {
        constructor(public eng: ReactiveEngine) { }
      }

      const instance = engine.inject(TestService);
      expect(instance).toBeInstanceOf(TestService);
      expect(instance.eng).toBe(engine);
    });

    it('должен выбрасывать ошибку, если токен не найден или пустой', () => {
      // Проверяем ошибку для пустого токена
      expect(() => engine.inject(undefined as any)).toThrow(
        '[DI Error]: Вы пытаетесь внедрить пустой токен (undefined/null). Проверьте импорты.'
      );
      // Проверяем ошибку для неизвестного токена
      expect(() => engine.inject('UNKNOWN_TOKEN')).toThrow(
        '[DI Error]: Не удалось создать сервис UNKNOWN_TOKEN. Ошибка: Service not found: UNKNOWN_TOKEN'
      );
    });
  });

  // ==========================================
  // 2. ТЕСТЫ SIGNALS & EFFECTS
  // ==========================================
  describe('Signals & Effects', () => {
    it('должен сохранять начальное значение и обновлять его при записи', () => {
      const sig = engine.signal(10);
      expect(sig.value).toBe(10);

      sig.value = 20;
      expect(sig.value).toBe(20);
    });

    it('должен автоматически запускать эффект при изменении сигнала', () => {
      const sig = engine.signal('initial');
      const spy = vi.fn();

      engine.effect(() => {
        spy(sig.value);
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('initial');

      sig.value = 'updated';
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('updated');
    });

    it('не должен триггерить эффект, если устанавливается идентичное значение', () => {
      const sig = engine.signal(42);
      const spy = vi.fn();

      engine.effect(() => {
        spy(sig.value);
      });

      spy.mockClear();
      sig.value = 42; // Значение не изменилось
      expect(spy).not.toHaveBeenCalled();
    });

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта', () => {
      const sig = engine.signal(1);
      const cleanupSpy = vi.fn();

      const unsubscribe = engine.effect(() => {
        const val = sig.value;
        return () => cleanupSpy(val);
      });

      expect(cleanupSpy).not.toHaveBeenCalled();

      sig.value = 2; // Перезапуск эффекта
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledWith(1);

      unsubscribe(); // Ручная отписка
      expect(cleanupSpy).toHaveBeenCalledTimes(2);
      expect(cleanupSpy).toHaveBeenCalledWith(2);
    });

    it('должен поддерживать валидацию значений сигнала', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const sig = engine.signal(10, {
        validate: (val) => val > 0 || 'Число должно быть больше 0',
      });

      sig.value = -5; // Невалидное значение
      expect(sig.value).toBe(10); // Значение не изменилось
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ==========================================
  // 3. ТЕСТЫ COMPUTED PROPERTIES
  // ==========================================
  describe('Computed Properties', () => {
    it('должен вычислять значение на основе зависимых сигналов', () => {
      const firstName = engine.signal('John');
      const lastName = engine.signal('Doe');
      const fullName = engine.computed(() => `${firstName.value} ${lastName.value}`);

      expect(fullName.value).toBe('John Doe');

      firstName.value = 'Jane';
      expect(fullName.value).toBe('Jane Doe');
    });

    it('должен позволять подписываться на изменение вычисляемого значения', () => {
      const count = engine.signal(1);
      const isEven = engine.computed(() => count.value % 2 === 0);
      const spy = vi.fn();

      isEven.subscribe(spy); // Подписка автоматически вызывает эффект из-за реализации в ядре

      count.value = 2; // isEven меняется на true
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  // ==========================================
  // 4. ТЕСТЫ BATCHING (ПАКЕТНЫЕ ОБНОВЛЕНИЯ)
  // ==========================================
  describe('Batching', () => {
    it('должен откладывать запуск эффектов до завершения батча (микрозадачи)', async () => {
      const sig1 = engine.signal(1);
      const sig2 = engine.signal(10);
      const spy = vi.fn();

      engine.effect(() => {
        spy(sig1.value, sig2.value);
      });

      spy.mockClear();

      engine.batch(() => {
        sig1.value = 2;
        sig2.value = 20;
        // Внутри батча эффект не должен сработать немедленно
        expect(spy).not.toHaveBeenCalled();
      });

      // Ждем выполнения очереди микрозадач (queueMicrotask)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Эффект сработал ровно 1 раз для финальных значений вместо 2 раз
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(2, 20);
    });
  });

  // ==========================================
  // 5. ТЕСТЫ REACTIVE PROXY
  // ==========================================
  describe('Reactive Proxy', () => {
    it('должен отслеживать изменения глубоких свойств объекта', () => {
      const state = engine.reactive({ user: { age: 25 }, tags: ['js'] });
      const spy = vi.fn();

      engine.effect(() => {
        spy(state.user.age);
      });

      spy.mockClear();
      state.user.age = 26;
      expect(spy).toHaveBeenCalledWith(26);
    });

    it('должен кешировать Proxy для одного и того же объекта', () => {
      const obj = { x: 1 };
      const proxy1 = engine.reactive(obj);
      const proxy2 = engine.reactive(obj);

      expect(proxy1).toBe(proxy2);
    });
  });

  // ==========================================
  // 6. ТЕСТЫ RESOURCES (АСИНХРОННЫЕ РЕСУРСЫ)
  // ==========================================
  describe('Resources', () => {
    it('должен корректно отрабатывать жизненный цикл загрузки данных', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched_data');
      const source = engine.signal(1);

      const res = engine.resource(fetcher, source);

      // Изначальное состояние загрузки
      expect(res.loading).toBe(true);
      expect(res.data).toBeNull();

      // Ждем разрешения промиса во внутреннем тике
      await vi.waitFor(() => expect(res.loading).toBe(false));

      expect(res.data).toBe('fetched_data');
      expect(res.error).toBeNull();
    });

    it('должен прерывать предыдущий запрос при изменении source зависимостей', async () => {
      let resolveFirstRequest: any;
      const firstPromise = new Promise((resolve) => { resolveFirstRequest = resolve; });

      const fetcher = vi.fn()
        .mockImplementationOnce((_src, _signal) => firstPromise)
        .mockResolvedValueOnce('second_data');

      const source = engine.signal(1);
      const res = engine.resource(fetcher, source);

      // Меняем source до того, как первый промис зарезолвился
      source.value = 2;

      await vi.waitFor(() => expect(res.loading).toBe(false));

      // Данные первого запроса должны быть проигнорированы, так как сработал AbortController
      expect(res.data).toBe('second_data');
    });
  });

  // ==========================================
  // 7. ТЕСТЫ REACT ADAPTERS (МЕТОД engine.use)
  // ==========================================
  describe('React Adapters (engine.use)', () => {
    it('должен выбрасывать ошибку, если адаптеры React не установлены', () => {
      const engineWithoutAdapters = new ReactiveEngine();
      // Зануляем дефолтные, если они проставились
      engineWithoutAdapters.setReactAdapters(null, null);
      const sig = engineWithoutAdapters.signal(0);

      expect(() => engineWithoutAdapters.use(sig)).toThrow('this.reactAdapters.useState is not a function or its return value is not iterable');
    });

    it('должен успешно синхронизировать сигнал с хуками React', () => {
      engine.setReactAdapters(useState, useEffect);
      const sig = engine.signal('hello');

      // Используем @testing-library/react для эмуляции вызова внутри компонента
      const { result } = renderHook(() => engine.use(sig));

      expect(result.current).toBe('hello');

      // Изменяем сигнал внутри act(), чтобы React зафиксировал ререндер
      act(() => {
        sig.value = 'world';
      });

      expect(result.current).toBe('world');
    });
  });
});
