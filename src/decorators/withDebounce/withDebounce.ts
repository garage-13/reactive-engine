interface DebounceOptions {
  /** Задержка в миллисекундах. По умолчанию 300 мс */
  delay?: number;
}

/**
 * Декоратор для создания дебаунсящего (отложенного) загрузчика данных, специально
 * адаптированный для использования совместно с `engine.resource`.
 *
 * Откладывает выполнение асинхронной функции `fetcher` на заданную задержку `options.delay`.
 * Если в течение этого интервала происходит новый вызов (например, пользователь продолжает вводить текст),
 * таймер сбрасывается, а предыдущий ожидающий промис принудительно отклоняется. В итоге выполняется
 * только один запрос — после того, как поток вызовов затихнет.
 *
 * ### 🧠 Механика управления промисами (Контур Debounce):
 * 1. **Сброс дребезга:** При каждом вызове функции проверяется наличие активного таймера. Если он есть,
 *    `clearTimeout` мгновенно останавливает его.
 * 2. **Каскадное отклонение:** Ссылка на метод `reject` каждого создаваемого промиса сохраняется в `rejectPrevious`.
 *    При поступлении нового запроса предыдущий промис не остается «зависшим», а принудительно переходит
 *    в состояние `rejected` с ошибкой `AbortError`. Это сигнализирует ядру, что данные устарели.
 * 3. **Чистый запуск:** Оригинальный `fetcher` вызывается только тогда, когда таймер успешно дотикал до конца,
 *    не будучи прерванным.
 *
 * @template S Тип входных данных (аргументов) для функции запроса.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом (разрешенное значение промиса).
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Оригинальная асинхронная функция запроса, принимающая параметры и сигнал отмены.
 * @param {DebounceOptions} [options={}] Параметры конфигурации дебаунса.
 * @param {number} [options.delay=300] Время ожидания в миллисекундах с момента последнего вызова до фактического старта запроса.
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Возвращает обернутую дебаунс-функцию, возвращающую `Promise<T>` и полностью сохраняющую исходную сигнатуру типов.
 *
 * @example
 * ```typescript
 * import { withDebounce } from '@pravosleva/reactive-engine';
 *
 * const searchProducts = async (query: string, signal: AbortSignal) => {
 *   const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`, { signal });
 *   return res.json();
 * };
 *
 * // Запрос уйдет только через 400мс после того, как пользователь перестанет нажимать клавиши
 * const debouncedFetch = withDebounce(searchProducts, { delay: 400 });
 *
 * // Интеграция с фабрикой ресурсов вашего реактивного ядра
 * const productSearchResource = engine.resource({
 *   fetcher: debouncedFetch,
 *   source: () => searchInputValue.value // Следит за сигналом строки ввода
 * });
 * ```
 *
 * @abstract
 * ### 🚨 Сквозная интеграция с AbortSignal и менеджмент памяти
 * Декоратор непрерывно отслеживает состояние нативного `AbortSignal`, передаваемого движком (например, при размонтировании UI-виджета):
 * - Если сигнал переходит в состояние `aborted` во время отсчета таймаута дебаунса, таймер сбрасывается,
 *   а промис мгновенно отклоняется.
 * - При успешном выполнении таймера слушатель `abort` своевременно удаляется через `removeEventListener`,
 *   исключая накопление холостых подписок.
 * - Все внутренние ссылки на методы разрешения промисов (`rejectPrevious`, `timeoutId`) принудительно зануляются (`null`),
 *   очищая замыкания от застрявших в памяти объектов и защищая Node.js/браузер от утечек.
 */
export const withDebounce = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: DebounceOptions = {}
) => {
  const delay = options.delay ?? 300

  // Храним ссылку на активный таймер текущего ожидания
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  // Храним функцию отмены для предыдущего неоконченного промиса ожидания
  let rejectPrevious: ((reason: any) => void) | null = null

  return (source: S, signal: AbortSignal): Promise<T> => {
    // 1. Если уже идет ожидание другого запроса — отменяем его промис и очищаем таймер
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    if (rejectPrevious) {
      // Бросаем DOMException, имитируя нативную отмену fetch, чтобы движок понял, что запрос прерван
      rejectPrevious(new DOMException('Aborted due to debounce', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      // Сохраняем ссылку на reject текущего промиса, чтобы его мог отменить следующий вызов
      rejectPrevious = reject

      // 2. Слушаем нативный AbortSignal от движка (например, если компонент размонтировался во время дебаунса)
      const onAbort = () => {
        if (timeoutId) clearTimeout(timeoutId)
        reject(new DOMException('Aborted by resource signal', 'AbortError'))
      }

      if (signal.aborted) {
        return onAbort()
      }
      signal.addEventListener('abort', onAbort)

      // 3. Взводим отложенный таймер выполнения
      timeoutId = setTimeout(async () => {
        // Убираем слушатель, так как таймаут успешно дождался конца
        signal.removeEventListener('abort', onAbort)
        rejectPrevious = null
        timeoutId = null

        try {
          // 4. Запускаем оригинальный fetcher
          const data = await fetcher(source, signal)
          resolve(data)
        } catch (error) {
          reject(error)
        }
      }, delay)
    })
  }
}
