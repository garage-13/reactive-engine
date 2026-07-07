import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReactiveValue } from './useReactiveValue';   // Версия на useSyncExternalStore
import { useReactiveValue0 } from './useReactiveValue0'; // Версия на useState + useEffect

// Описываем фабрику тестов, так как логика работы обоих хуков должна быть абсолютно идентичной
const runReactiveValueTests = (hookName: string, hookFn: typeof useReactiveValue) => {
  describe(`Реализация: ${hookName}`, () => {
    let mockSignal: { value: number; subscribe: any };
    let subscribers: Set<(val: number) => void>;

    beforeEach(() => {
      subscribers = new Set();
      mockSignal = {
        value: 42,
        subscribe: vi.fn((cb: (val: number) => void) => {
          subscribers.add(cb);
          return () => {
            subscribers.delete(cb);
          };
        })
      };
    });

    it('должен возвращать актуальное начальное значение сигнала при монтировании', () => {
      const { result } = renderHook(() => hookFn(mockSignal));

      expect(result.current).toBe(42);
      expect(mockSignal.subscribe).toHaveBeenCalledTimes(1);
    });

    it('должен вызывать ререндер компонента и возвращать новое значение при изменении сигнала', () => {
      const { result } = renderHook(() => hookFn(mockSignal));

      expect(result.current).toBe(42);

      // Имитируем изменение значения сигнала внутри ядра
      mockSignal.value = 100;

      // Оповещаем подписчиков (React должен зафиксировать это и обновить стейт/стору)
      act(() => {
        subscribers.forEach(cb => cb(100));
      });

      // Проверяем, что хук вернул новое значение наружу
      expect(result.current).toBe(100);
    });

    it('должен корректно отписываться от сигнала при размонтировании (unmount)', () => {
      const { unmount } = renderHook(() => hookFn(mockSignal));

      expect(subscribers.size).toBe(1);

      // Удаляем хук
      unmount();

      // Наш Set подписчиков должен стать пустым, предотвращая утечки памяти
      expect(subscribers.size).toBe(0);
    });

    it('должен переподписываться на новый сигнал, если объект сигнала в аргументах заменили', () => {
      const mockSignal2 = {
        value: 777,
        subscribe: vi.fn(() => () => { })
      };

      const { result, rerender } = renderHook(
        ({ sig }) => hookFn(sig),
        { initialProps: { sig: mockSignal } }
      );

      expect(result.current).toBe(42);

      // Передаем в хук второй сигнал
      rerender({ sig: mockSignal2 });

      // Старая подписка должна быть удалена
      expect(subscribers.size).toBe(0);
      // Новая подписка должна быть активна, а значение — обновиться
      expect(mockSignal2.subscribe).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(777);
    });
  });
};

// Запускаем единый набор тестов для обеих версий хуков
describe('useReactiveValue Hooks Suite', () => {
  runReactiveValueTests('React 18+ (useSyncExternalStore)', useReactiveValue);
  runReactiveValueTests('React 16.8+ (useState + useEffect)', useReactiveValue0);
});
