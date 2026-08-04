import { AbstractService } from '@pravosleva/reactive-engine'

interface DebounceOptions {
  delay?: number
}

export const withDebounce = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: DebounceOptions = {}
) => {
  const delay = options.delay ?? 300
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let rejectPrevious: ((reason: any) => void) | null = null

  return (source: S, signal: AbortSignal): Promise<T> => {
    if (timeoutId) clearTimeout(timeoutId)
    if (rejectPrevious) {
      rejectPrevious(new DOMException('Aborted due to debounce', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      rejectPrevious = reject

      const onAbort = () => {
        if (timeoutId) clearTimeout(timeoutId)
        reject(new DOMException('Aborted by resource signal', 'AbortError'))
      }

      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort)

      timeoutId = setTimeout(async () => {
        signal.removeEventListener('abort', onAbort)
        rejectPrevious = null
        timeoutId = null

        try {
          const data = await fetcher(source, signal)
          resolve(data)
        } catch (error) {
          reject(error)
        }
      }, delay)
    })
  }
}

// Сам бизнес-сервис
export class SearchLogic extends AbstractService {
  // Сигнал, куда React-инпут будет записывать текст на каждый символ
  public querySignal = this.createSignal<string>('', 'search:signal:query')

  /**
   * Реактивный ресурс, обёрнутый в декоратор withDebounce.
   * Движок автоматически перезапускает его при изменении querySignal,
   * но декоратор принудительно задерживает реальное выполнение на 500 мс.
   */
  public searchResource = this.engine.resource(
    withDebounce(
      async (queryValue, _abortSignal) => {
        // Имитируем задержку ответа от сервера (например, чтение из базы)
        await new Promise((resolve) => setTimeout(resolve, 400))

        // Фейковый результат поиска
        // В этом месте возвращается массив строк исключительно ради наглядности демонстрации в UI
        // (чтобы в блоке результатов под инпутом можно было отрендерить список с помощью метода .map()).
        return [
          `Результат 1 для "${queryValue}"`,
          `Результат 2 для "${queryValue}"`,
          `Результат 3 для "${queryValue}"`
        ]
      },
      { delay: 500 } // Задержка дебаунса 500 мс
    ),
    this.querySignal,
    {
      name: 'search:resource:fetch',
      // Не отправляем запрос, если инпут пустой
      validateBeforeFetch: (queryValue) => !!queryValue.trim()
    }
  )

  /**
   * Экшен обновления поисковой строки из UI
   */
  public updateQuery(val: string) {
    this.querySignal.value = val
  }
}
