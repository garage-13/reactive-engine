import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { renderHook, act } from '@testing-library/react'; // Нужен для теста метода engine.use
import { ReactiveEngine } from './core'; // Путь к вашему файлу ядра

interface EngineWithPrivate {
  allEffects: Set<unknown>;
  computedCache: Map<unknown, unknown>;
}

// 1. ВЫНОСИМ В ИЗОЛИРОВАННУЮ ФУНКЦИЮ НАВЕРХ
// Это гарантирует, что при выходе из этой функции стек Node.js полностью очистится
function createTemporaryComputed(engine: ReactiveEngine, countSignal: any) {
  // Просто создаем computed и считываем значение, чтобы активировать эффект
  const isEven = engine.computed(() => countSignal.value % 2 === 0);
  return isEven.value;
}

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

    it('должен автоматически запускать эффект при изменении сигнала', async () => {
      const sig = engine.signal('initial');
      const spy = vi.fn();

      engine.effect(() => {
        spy(sig.value);
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('initial');

      sig.value = 'updated';

      // Ждем выполнения отложенного микрозадачей эффекта
      await new Promise<void>((resolve) => queueMicrotask(resolve));

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

    it('должен вызывать функцию очистки (cleanup) перед следующим запуском эффекта', async () => {
      const sig = engine.signal(1);
      const cleanupSpy = vi.fn();

      const unsubscribe = engine.effect(() => {
        const val = sig.value;
        return () => cleanupSpy(val);
      });

      expect(cleanupSpy).not.toHaveBeenCalled();

      sig.value = 2; // Перезапуск эффекта отложен

      // Ждем выполнения микрозадачи
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledWith(1);

      unsubscribe(); // Ручная отписка происходит синхронно
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
    it('должен вычислять значение на основе зависимых сигналов', async () => {
      const firstName = engine.signal('John');
      const lastName = engine.signal('Doe');
      const fullName = engine.computed(() => `${firstName.value} ${lastName.value}`);

      expect(fullName.value).toBe('John Doe');

      firstName.value = 'Jane';

      // Вычисление computed завязано на эффект, который теперь асинхронный
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      expect(fullName.value).toBe('Jane Doe');
    });

    it('должен позволять подписываться на изменение вычисляемого значения', async () => {
      const count = engine.signal(1);
      const isEven = engine.computed(() => count.value % 2 === 0);
      const spy = vi.fn();

      isEven.subscribe(spy);

      count.value = 2;

      // Ждем цепочку микрозадач сигналов и computed
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith(true);
      });
    });

    it('должен удалять внутренний эффект из памяти ядра при вызове метода destroy', async () => {
      const count = engine.signal(1);
      const getAllEffectsSize = () => (engine as any).allEffects.size;
      const initialSize = getAllEffectsSize();

      const isEven = engine.computed(() => count.value % 2 === 0);
      expect(getAllEffectsSize()).toBe(initialSize + 1);

      count.value = 2;

      // Даем отработать обновлению до того, как уничтожим
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(isEven.value).toBe(true);

      isEven.destroy();
      expect(getAllEffectsSize()).toBe(initialSize);
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

    it('должен объединять несколько синхронных обновлений в один ререндер (Автобатчинг)', async () => {
      const sig1 = engine.signal(0);
      const sig2 = engine.signal(0);
      const effectSpy = vi.fn();

      // Создаем эффект, зависящий от обоих сигналов
      engine.effect(() => {
        effectSpy(sig1.value, sig2.value);
      });

      // Очищаем первоначальный вызов при монтировании эффекта
      effectSpy.mockClear();

      // Имитируем два синхронных изменения подряд БЕЗ использования метода engine.batch
      sig1.value = 10;
      sig2.value = 20;

      // Ждем окончания текущего цикла микрозадач (Event Loop)
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // ПРОВЕРКА:
      // Если в вашей текущей версии ядра тест ПАДАЕТ (вызовов будет 2) — автобатчинга нет.
      // Иначе тест станет ЗЕЛЕНЫМ (вызов будет ровно 1)!
      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenCalledWith(10, 20);
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

      // Принудительно передаем null через as any, чтобы обойти строгую проверку типов в тесте
      engineWithoutAdapters.setReactAdapters(null as any, null as any);

      const sig = engineWithoutAdapters.signal(0);

      expect(() => engineWithoutAdapters.use(sig)).toThrow(
        'this.reactAdapters.useState is not a function or its return value is not iterable'
      );
    });

    it('должен успешно синхронизировать сигнал с хуками React', async () => {
      engine.setReactAdapters(useState, useEffect);
      const sig = engine.signal('hello');

      const { result } = renderHook(() => engine.use(sig));
      expect(result.current).toBe('hello');

      // Изменяем сигнал внутри act. Так как act в React умеет сам дожидаться асинхронных микрозадач,
      // нам просто нужно использовать async/await версию act
      await act(async () => {
        sig.value = 'world';
      });

      expect(result.current).toBe('world');
    });
  });

  // ==========================================
  // 8. ТЕСТЫ с Garbage Collector
  // Чтобы принудительно разорвать контекст выполнения и гарантировать,
  // что V8 полностью сотрет локальные ссылки из стека,
  // мы должны вынести создание computed в отдельную изолированную функцию верхнего уровня,
  // а вызов сборщика мусора сделать многократным с микро-паузами (setTimeout / setImmediate).
  // ==========================================
  describe('Автоочистка памяти через FinalizationRegistry', () => {
    let engine: ReactiveEngine;

    beforeEach(() => {
      engine = new ReactiveEngine();
    });

    it('должен автоматически стирать эффект из ядра, когда GC удаляет computed из памяти', async () => {
      if (typeof global.gc !== 'function') {
        console.warn('⚠️ Тест пропущен: Запустите vitest с флагом --expose-gc');
        return;
      }

      const count = engine.signal(10);
      const getAllEffectsSize = () => (engine as unknown as EngineWithPrivate).allEffects.size;
      const getCacheSize = () => (engine as unknown as EngineWithPrivate).computedCache.size;

      const initialEffects = getAllEffectsSize();

      // 2. Вызываем изолированную функцию. Ссылка внутри нее умирает сразу после выполнения
      createTemporaryComputed(engine, count);

      // В ядре сейчас зафиксирован 1 эффект
      expect(getAllEffectsSize()).toBe(initialEffects + 1);
      expect(getCacheSize()).toBe(1);

      // 3. Запускаем агрессивный цикл сборки мусора (Full GC)
      // Иногда V8 требуется 2-3 прохода, чтобы переместить объект в старое поколение и полностью удалить
      for (let i = 0; i < 3; i++) {
        global.gc();
        // Делаем микропаузу, позволяя Event Loop переключить контексты задач
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // 4. Ожидаем, пока FinalizationRegistry асинхронно выполнит коллбек очистки ядра
      await vi.waitFor(() => {
        expect(getAllEffectsSize()).toBe(initialEffects);
        expect(getCacheSize()).toBe(0);
      });
    });
  });
});
