interface StaleOptions<T> {
  /**
   * Дефолтное значение, которое вернется при самом первом запросе,
   * если он завершился ошибкой или был отменен.
   */
  initialData?: T;
  isLogsEnabled?: boolean;
}

/**
 * Декоратор для сохранения предыдущего успешного состояния данных,
 * специально адаптированный для использования совместно с `engine.resource`.
 *
 * Оборачивает асинхронную функцию `fetcher`. Если текущий запрос отменяется
 * (например, через AbortSignal при перетаскивании карты) или завершается ошибкой,
 * декоратор перехватывает исключение и возвращает последнее успешно полученное значение.
 *
 * ### 🧠 Механика Stale-While-Revalidate:
 * 1. **Стабильный кэш последнего состояния:** Декоратор сохраняет в замыкании успешный результат.
 * 2. **Грациозная деградация (Graceful Degradation):** При возникновении `AbortError` (отмена)
 *    или любого другого сетевого сбоя, вместо выброса исключения в граф возвращается `stale`-дата.
 * 3. **Бесшовный UX:** Карта или UI-компонент не сбрасывают свое состояние в `null` во время
 *    перепривязки сигналов, исключая эффект "моргания".
 *
 * @template S Тип входных данных (аргументов) для функции запроса.
 * @template T Тип данных, возвращаемых асинхронным `fetcher`-ом.
 *
 * @param {(source: S, signal: AbortSignal) => Promise<T>} fetcher Оригинальная асинхронная функция запроса.
 * @param {StaleOptions<T>} [options={}] Параметры конфигурации предыдущего состояния.
 *
 * @returns {(source: S, signal: AbortSignal) => Promise<T>} Вовращает обернутую функцию с сохраненной сигнатурой типов.
 */
export const withStaleWhileRevalidate = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: StaleOptions<T> = {}
) => {
  // Хранилище для последнего успешного ответа сервера в рамках замыкания декоратора
  let lastValidData: T | undefined = options.initialData
  const isLogsEnabled = options.isLogsEnabled ?? false

  return async (source: S, signal: AbortSignal): Promise<T> => {
    // Если запрос отменен еще до старта, сразу возвращаем последнее известное состояние
    if (signal.aborted) {
      if (lastValidData !== undefined) return lastValidData
      throw signal.reason || new DOMException('The operation was aborted.', 'AbortError')
    }

    try {
      // Выполняем реальный сетевой запрос
      const freshData = await fetcher(source, signal)

      // Запоминаем успешный результат
      lastValidData = freshData

      return freshData
    } catch (error) {
      // Если запрос был отменен движком (например, изменился bbox) ИЛИ произошла сетевая ошибка
      const isAbort = error instanceof DOMException && error.name === 'AbortError'

      // Если у нас уже есть сохраненные старые данные — отдаем их вместо падения
      if (lastValidData !== undefined) {
        if (isLogsEnabled) {
          // Логируем для трассировки в dev-режиме (опционально)
          console.warn(
            `[ReactiveEngine:Stale] Запрос ${isAbort ? 'отменен' : 'упал с ошибкой'}. Отдаем предыдущее состояние.`,
            error
          )
        }
        return lastValidData
      }

      // Если это самый первый запрос и кэш пуст — прокидываем ошибку дальше в граф
      throw error
    }
  }
}
