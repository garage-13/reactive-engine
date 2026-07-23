import { BaseREService } from '../../BaseREService'

export interface UserState {
  theme: 'light' | 'dark'
  fontSize: number
  username: string
}

export interface HistoryAction {
  timestamp: number
  description: string
  stateSnapshot: UserState
}

const DEFAULT_STATE: UserState = {
  theme: 'dark',
  fontSize: 14,
  username: 'Guest'
}

const STORAGE_KEY = 'app:user-state-cache'

export class HistoryStateLogic extends BaseREService {
  public state = this.createSignal<UserState>(this.loadFromStorage(), 'history:signal:state')
  public serverLogs = this.createSignal<string[]>([], 'history:signal:logs')

  private undoStack: HistoryAction[] = []
  private isApplyingHistory = false
  private syncTrigger = this.createSignal<HistoryAction | null>(null, 'history:signal:sync-trigger')

  /**
   * ИСПРАВЛЕННЫЙ РЕСУРС: Логирование перенесено прямо в асинхронное тело функции.
   * Это на 100% страхует от зависаний страницы и скрытых зацикливаний.
   */
  public syncResource = this.engine.resource(
    async (action, abortSignal) => {
      if (!action) return null

      // Имитируем задержку сети
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000)
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Запрос отменен'))
        })
      })

      // ИСПРАВЛЕНИЕ: Пишем лог прямо здесь, в конце асинхронного потока!
      // Так как это не реактивный эффект, бесконечный цикл физически невозможен.
      this.serverLogs.value = [
        ...this.serverLogs.value,
        `🟢 Успешно синхронизировано: "${action.description}"`
      ]

      return { success: true, actionDescription: action.description }
    },
    this.syncTrigger,
    {
      name: 'history:resource:sync',
      validateBeforeFetch: (action) => !!action
    }
  )

  public canUndo = this.createComputed<boolean>(() => {
    this.state.value
    return this.undoStack.length > 0
  })

  private loadFromStorage(): UserState {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      return cached ? JSON.parse(cached) : DEFAULT_STATE
    } catch {
      return DEFAULT_STATE
    }
  }

  private commitChange(description: string, previousState: UserState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.value))

    if (!this.isApplyingHistory) {
      const action: HistoryAction = {
        timestamp: Date.now(),
        description,
        stateSnapshot: JSON.parse(JSON.stringify(previousState))
      }
      this.undoStack.push(action)
      this.syncTrigger.value = action
    }
  }

  public updateUsername(name: string) {
    const prev = this.state.value
    this.state.value = { ...prev, username: name }
    this.commitChange(`Изменение имени на "${name}"`, prev)
  }

  public toggleTheme() {
    const prev = this.state.value
    const nextTheme = prev.theme === 'light' ? 'dark' : 'light'
    this.state.value = { ...prev, theme: nextTheme }
    this.commitChange(`Переключение темы на ${nextTheme}`, prev)
  }

  public changeFontSize(delta: number) {
    const prev = this.state.value
    this.state.value = { ...prev, fontSize: prev.fontSize + delta }
    this.commitChange(`Изменение шрифта на ${this.state.value.fontSize}px`, prev)
  }

  public undo() {
    if (this.undoStack.length === 0) return

    const previousAction = this.undoStack.pop()!

    this.isApplyingHistory = true
    this.state.value = previousAction.stateSnapshot
    localStorage.setItem(STORAGE_KEY, JSON.stringify(previousAction.stateSnapshot))
    this.isApplyingHistory = false

    this.serverLogs.value = [
      ...this.serverLogs.value,
      `↩️ Откат действия: "${previousAction.description}"`
    ]
  }

  public reset() {
    this.undoStack = []
    this.state.value = DEFAULT_STATE
    localStorage.removeItem(STORAGE_KEY)
    this.serverLogs.value = []
    this.syncTrigger.value = null
  }

  public destroy() {
    // Метод очистки эффектов больше не нужен и оставлен пустым
  }
}
