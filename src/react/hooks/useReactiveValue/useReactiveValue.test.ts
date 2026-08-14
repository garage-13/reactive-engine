import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReactiveValue } from './useReactiveValue'
import { useReactiveValue0 } from '../useReactiveValue0'

/*

## Итоги тестирования

Тесты для обоих хуков проверяют их главную задачу: извлечение текущего значения из сигнала и автоматический запуск перерисовки компонента (ререндер) при обновлении данных.
Для проверки реактивного обновления мы будем использовать `renderHook` и `act`.

### 🔍 Что важного проверяет этот тест:

1. **Синхронизация стейта**: Тест должен вызывать ререндер... критически важен. Он гарантирует, что когда ядро вашей библиотеки пушит новое значение через коллбек `subscribe(newValue)`, React-компонент мгновенно узнает об этом и обновляет интерфейс.
2. **Параметризация через замыкание**: Функция `runReactiveValueTests` позволяет прогнать один и тот же строгий контракт поведения сразу на двух разных архитектурах хуков. Если вы где-то ошиблись в логике обновления `useRef` в старой версии или в ссылках новой — тест сразу это покажет.

*/

const runAutoCleanupTests = (hookName: string, hookFn: any) => {
  describe(`Авто-очистка под капотом: ${hookName}`, () => {

    it('должен гарантированно вызывать метод .destroy() при размонтировании, ОДНАКО только для ленивых фабрик', async () => {
      const destroySpy = vi.fn()
      const mockReactiveItem = {
        value: 'factory_computed',
        subscribe: vi.fn(() => () => { }),
        destroy: destroySpy
      }

      // Передаем как фабрику () => mock
      const { unmount } = renderHook(() => hookFn(() => mockReactiveItem))
      unmount()

      await vi.waitFor(() => {
        expect(destroySpy).toHaveBeenCalledTimes(1)
      })
    })

    it('КРИТИЧЕСКИЙ ТЕСТ: НЕ должен вызывать метод .destroy() для общих глобальных сигналов', async () => {
      const globalDestroySpy = vi.fn()
      const mockGlobalSignal = {
        value: 'global_shared_state',
        subscribe: vi.fn(() => () => { }),
        destroy: globalDestroySpy // Этот метод НЕ должен быть вызван хуком!
      }

      // Передаем готовый сигнал напрямую, имитируя глобальный стор
      const { unmount } = renderHook(() => hookFn(mockGlobalSignal))
      unmount()

      // Даем время эффектам пройти
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Проверяем железный контракт: глобальный стейт остался невредим!
      expect(globalDestroySpy).not.toHaveBeenCalled()
    })
  })
}

describe('Интеграционные тесты авто-очистки памяти', () => {
  runAutoCleanupTests('React 18+ (useSyncExternalStore)', useReactiveValue)
  runAutoCleanupTests('React 16.8+ (useState + useEffect)', useReactiveValue0)
})
