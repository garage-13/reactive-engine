import { BaseREService } from '../../BaseREService'
import { FormHistoryService, FormStateSnapshot } from './service.FormHistoryService'

const INITIAL_DEFAULT_STATE: FormStateSnapshot = {
  step: 1,
  formData: {
    username: '',
    email: '',
    agreeToTerms: false
  }
}

export class MultiStepFormLogic extends BaseREService {
  /** Внедренный сервис истории через DI движка */
  public history = this.engine.inject(FormHistoryService)

  // Базовые сигналы состояния формы (восстанавливаются из кэша истории)
  public step = this.createSignal<number>(1, 'form:signal:step')
  public username = this.createSignal<string>('', 'form:signal:username')
  public email = this.createSignal<string>('', 'form:signal:email')
  public agreeToTerms = this.createSignal<boolean>(false, 'form:signal:agree')

  // Флаг блокировки записи в историю во время наката операции Undo
  private isApplyingHistory = false

  /**
   * Инициализирует стартовое состояние формы из кэша LocalStorage
   */
  public initializeForm() {
    const cached = this.history.loadInitialCache()
    if (cached) {
      this.step.value = cached.step
      this.username.value = cached.formData.username
      this.email.value = cached.formData.email
      this.agreeToTerms.value = cached.formData.agreeToTerms
    }
  }

  /**
   * Вспомогательный метод для снятия текущего слепка (Snapshot) состояния
   */
  private createSnapshot(): FormStateSnapshot {
    return {
      step: this.step.value,
      formData: {
        username: this.username.value,
        email: this.email.value,
        agreeToTerms: this.agreeToTerms.value
      }
    }
  }

  /**
   * Фиксирует изменения в LocalStorage и отправляет логи через дочерний сервис
   */
  private trackAction(description: string, prevSnapshot: FormStateSnapshot) {
    const currentSnapshot = this.createSnapshot()
    if (!this.isApplyingHistory) {
      this.history.commit(description, currentSnapshot, prevSnapshot)
    }
  }

  /** Проверка валидности первого шага (Имя) */
  public isStep1Valid = this.createComputed<boolean>(() => {
    return this.username.value.trim().length >= 2
  })

  /** Проверка валидности второго шага (Email) */
  public isStep2Valid = this.createComputed<boolean>(() => {
    return this.email.value.includes('@') && this.email.value.includes('.')
  })

  /** Проверка валидности третьего шага (Согласие) */
  public isStep3Valid = this.createComputed<boolean>(() => {
    return this.agreeToTerms.value === true
  })

  /** Доступность кнопки отката назад (Undo) */
  public canUndo = this.createComputed<boolean>(() => {
    // Подписываемся на изменение шага, чтобы computed пересчитывался при мутациях формы
    this.step.value
    return this.history.getUndoStackLength() > 0
  })

  // --- ЭКШЕНЫ ИЗМЕНЕНИЯ ПОЛЕЙ ---

  public updateUsername(val: string) {
    const prev = this.createSnapshot()
    this.username.value = val
    this.trackAction(`Ввод имени: "${val}"`, prev)
  }

  public updateEmail(val: string) {
    const prev = this.createSnapshot()
    this.email.value = val
    this.trackAction(`Ввод email: "${val}"`, prev)
  }

  public updateAgreement(val: boolean) {
    const prev = this.createSnapshot()
    this.agreeToTerms.value = val
    this.trackAction(val ? 'Принято соглашение' : 'Отклонено согласие', prev)
  }

  // --- ЭКШЕНЫ НАВИГАЦИИ ПО ФОРМЕ ---

  public nextStep() {
    const prev = this.createSnapshot()
    this.step.value += 1
    this.trackAction(`Переход на шаг ${this.step.value}`, prev)
  }

  public prevStep() {
    const prev = this.createSnapshot()
    this.step.value -= 1
    this.trackAction(`Возврат на шаг ${this.step.value}`, prev)
  }

  /**
   * ЭКШЕН UNDO: Откатывает форму на один реактивный шаг назад
   */
  public undo() {
    const previousAction = this.history.popUndoAction()
    if (!previousAction) return

    this.isApplyingHistory = true

    // Накатываем сохраненный снимок обратно в сигналы формы
    const snap = previousAction.snapshot
    this.step.value = snap.step
    this.username.value = snap.formData.username
    this.email.value = snap.formData.email
    this.agreeToTerms.value = snap.formData.agreeToTerms

    // Синхронизируем кэш LocalStorage
    this.history.updateCache(snap)

    this.isApplyingHistory = false

    // Дописываем системный лог об откате в стек логов дочернего сервиса
    this.history.serverLogs.value = [
      ...this.history.serverLogs.value,
      `↩️ Откачено действие: "${previousAction.description}"`
    ]
  }

  /**
   * ЭКШЕН: Полная очистка формы и кэша
   */
  public resetForm() {
    this.isApplyingHistory = true
    this.step.value = INITIAL_DEFAULT_STATE.step
    this.username.value = INITIAL_DEFAULT_STATE.formData.username
    this.email.value = INITIAL_DEFAULT_STATE.formData.email
    this.agreeToTerms.value = INITIAL_DEFAULT_STATE.formData.agreeToTerms
    this.isApplyingHistory = false

    this.history.clearAll()
  }

  public destroy() {
    this.history.clearAll()
  }
}
