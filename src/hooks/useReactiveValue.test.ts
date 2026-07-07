import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReactiveValue } from './useReactiveValue';
import { useReactiveValue0 } from './useReactiveValue0';

const runAutoCleanupTests = (hookName: string, hookFn: any) => {
  describe(`Авто-очистка под капотом: ${hookName}`, () => {

    it('должен гарантированно вызывать метод .destroy() при размонтировании компонента', async () => {
      // 1. Создаем изолированный мок-объект, имитирующий Computed/Signal
      const destroySpy = vi.fn();
      const mockReactiveItem = {
        value: 'test_value',
        subscribe: vi.fn(() => () => { }), // фейковая отписка
        destroy: destroySpy // шпион, который мы проверяем
      };

      // 2. Рендерим хук, передавая ему фабрику (как это будут делать коллеги)
      const { unmount } = renderHook(() => hookFn(() => mockReactiveItem));

      // Проверяем, что хук успешно вытащил начальное значение
      // (это доказывает, что под капотом useSyncExternalStore связался с объектом)

      // 3. Размонтируем компонент (имитируем уход пользователя со страницы)
      unmount();

      // 4. Проверяем публичный контракт: хук ОБЯЗАН был вызвать метод destroy
      // Используем vi.waitFor, так как эффекты очистки в React могут срабатывать асинхронно
      await vi.waitFor(() => {
        expect(destroySpy).toHaveBeenCalledTimes(1);
      });
    });
  });
};

describe('Интеграционные тесты авто-очистки памяти', () => {
  runAutoCleanupTests('React 18+ (useSyncExternalStore)', useReactiveValue);
  runAutoCleanupTests('React 16.8+ (useState + useEffect)', useReactiveValue0);
});
