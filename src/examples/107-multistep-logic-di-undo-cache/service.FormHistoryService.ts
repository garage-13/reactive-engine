import { BaseREService } from '../../BaseREService'

export interface FormStateSnapshot {
  step: number
  formData: {
    username: string
    email: string
    agreeToTerms: boolean
  }
}

export interface HistoryAction {
  timestamp: number
  description: string
  snapshot: FormStateSnapshot
}

const STORAGE_KEY = 'app:form-history-cache'

export class FormHistoryService extends BaseREService {
  // Сигнал для накопления логов синхронизации бэкенда
  public serverLogs = this.createSignal<string[]>([], 'history:signal:logs')

  // Стек для реализации отката (Undo)
  private undoStack: HistoryAction[] = []

  // Сигнал-триггер для асинхронного ресурса отправки данных
  private syncTrigger = this.createSignal<HistoryAction | null>(null, 'history:signal:sync-trigger')

  /**
   * Реактивный ресурс фейковой отправки действий пользователя на сервер.
   * Логирует успешное окончание операции прямо в конце асинхронного потока.
   */
  public syncResource = this.engine.resource(
    async (action, abortSignal) => {
      if (!action) return null

      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 800)
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Запрос отменен'))
        })
      })

      this.serverLogs.value = [
        ...this.serverLogs.value,
        `🟢 Сервер принял: "${action.description}"`
      ]

      return { success: true }
    },
    this.syncTrigger,
    {
      name: 'history:resource:sync',
      validateBeforeFetch: (action) => !!action
    }
  )

  /**
   * Сохраняет снимок состояния в кэш LocalStorage и отправляет лог на бэкенд
   */
  public commit(description: string, currentSnapshot: FormStateSnapshot, previousSnapshot: FormStateSnapshot) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSnapshot))

    const action: HistoryAction = {
      timestamp: Date.now(),
      description,
      snapshot: JSON.parse(JSON.stringify(previousSnapshot)) // Глубокий клон прошлого состояния
    }

    this.undoStack.push(action)
    this.syncTrigger.value = action
  }

  /**
   * Извлекает последнее действие из стека для отката
   */
  public popUndoAction(): HistoryAction | null {
    return this.undoStack.pop() || null
  }

  /**
   * Обновляет кэш в LocalStorage при принудительном накате стейта
   */
  public updateCache(snapshot: FormStateSnapshot) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  }

  /**
   * Чтение сохраненных данных из кэша при инициализации
   */
  public loadInitialCache(): FormStateSnapshot | null {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  /**
   * Полный сброс истории и кэша
   */
  public clearAll() {
    this.undoStack = []
    this.serverLogs.value = []
    this.syncTrigger.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  public getUndoStackLength(): number {
    return this.undoStack.length
  }
}
