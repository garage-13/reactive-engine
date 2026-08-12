import { AbstractService } from '@pravosleva/reactive-engine'
import { Step1TypeLogic } from './steps/Step1TypeLogic'
import { Step2FilesLogic } from './steps/Step2FilesLogic'
import { Step3SubmitLogic } from './steps/Step3SubmitLogic'

export type FormStep = 'TYPE' | 'FILES' | 'SUBMIT' | 'SUCCESS_PAGE' | 'ERROR_PAGE'
type FileploadStatus = 'PENDING' | 'LOADING' | 'SUCCESS' | 'ERROR'

interface StateMachineConfig {
  currentStep: FormStep
  successMessage: string | null
}

export class FormUploaderLogic extends AbstractService {
  // Регистрируем шаги через официальный DI-контейнер AbstractService
  public step1 = this.engine.inject(Step1TypeLogic)
  public step2 = this.engine.inject(Step2FilesLogic)
  public step3 = this.engine.inject(Step3SubmitLogic)

  // Стейт-машина шагов формы
  public machine = this.engine.reactive<StateMachineConfig>({
    currentStep: 'TYPE',
    successMessage: null
  }, 'example-113:state-machine')

  // Счётчик-триггер для пинка асинхронного ресурса отправки
  private submitTrigger = this.engine.signal<number>(0, 'example-113:signal:submit-trigger')

  // МОНОЛИТНЫЙ UI-МОСТ (Мастер-Реактивность):
  public uiBridge = this.engine.computed(() => {
    const currentStep = this.machine.currentStep

    // Принудительно просим файл-менеджер обновить свой статус на основе состояний ресурсов!
    this.step2.fileManager.updateGlobalStatus()

    const step1Res = this.step1.checkIsValid()
    const step2Res = step1Res.isValid ? this.step2.checkIsValid() : { isValid: false, message: null }
    const step3Res = (step1Res.isValid && step2Res.isValid) ? this.step3.checkIsValid() : { isValid: false, message: null }

    // Собираем плоский массив метаданных файлов и их индивидуальных сетевых статусов для React UI
    // ЧИСТЫЙ ПАССИВНЫЙ МАППИНГ:
    // Мы просто читаем свойства .error и .loading. Никаких вызовов методов мутации!
    const serializedFiles = this.step2.fileManager.state.items.map(item => {
      let statusStr: FileploadStatus = 'PENDING'

      if (item.uploadResource.error) statusStr = 'ERROR'
      else if (item.uploadResource.loading) statusStr = 'LOADING'
      else if (item.uploadResource.data && item.uploadResource.data.ok === true) statusStr = 'SUCCESS'

      return {
        id: item.id,
        name: item.name,
        sizeStr: item.sizeStr,
        status: statusStr,
        errorMessage: item.uploadResource.error?.message || null
      }
    })

    // Конфигурация кнопок стейт-машины (динамический расчет)
    let primaryLabel = 'Далее ➡️'
    let primaryEnabled = false
    let onPrimary = () => { }
    let secondaryLabel = ''
    let secondaryEnabled = false
    let onSecondary = () => { }

    switch (currentStep) {
    case 'TYPE':
      primaryLabel = 'Далее ➡️'
      primaryEnabled = step1Res.isValid
      onPrimary = () => { this.machine.currentStep = 'FILES' }
      secondaryLabel = 'Сбросить'
      secondaryEnabled = true
      onSecondary = () => this.resetForm()
      break
    case 'FILES':
      primaryLabel = 'Далее ➡️'
      primaryEnabled = step1Res.isValid && step2Res.isValid // Раздизейблится, если хоть один файл грузится или упал!
      onPrimary = () => { this.machine.currentStep = 'SUBMIT' }
      secondaryLabel = '⬅️ Назад'
      secondaryEnabled = true
      onSecondary = () => { this.machine.currentStep = 'TYPE' }
      break
    case 'SUBMIT':
      primaryLabel = '🚀 Отправить форму'
      primaryEnabled = step1Res.isValid && step2Res.isValid && step3Res.isValid
      onPrimary = () => { this.submitForm() }
      secondaryLabel = '⬅️ Назад'
      secondaryEnabled = true
      onSecondary = () => { this.machine.currentStep = 'FILES' }
      break
    case 'ERROR_PAGE':
      primaryLabel = '✨ Создать новое обращение'
      primaryEnabled = true
      onPrimary = () => { this.resetForm(); this.machine.currentStep = 'TYPE' }
      secondaryLabel = '⬅️ Назад'
      secondaryEnabled = true
      onSecondary = () => { this.machine.currentStep = 'TYPE' }
      break
    case 'SUCCESS_PAGE':
      primaryLabel = '✨ Создать новое обращение'
      primaryEnabled = true
      onPrimary = () => { this.resetForm(); this.machine.currentStep = 'TYPE' }
      break
    default:
      break
    }

    const basePayload = {
      currentStep,
      successMessage: this.machine.successMessage,
      appealType: this.step1.fields.appealType,
      ticketTitle: this.step1.fields.ticketTitle,
      files: serializedFiles, // Отдаем массив с плоскими статусами ресурсов
      fileGlobalStatus: this.step2.fileManager.state.globalStatus,
      fileSystemError: this.step2.fileManager.state.errorMessage,
      totalSizeStr: `${(this.step2.fileManager.state.totalSize / 1024 / 1024).toFixed(2)} MB`,
      description: this.step3.fields.description,
      agreeToTerms: this.step3.fields.agreeToTerms,
      actions: { primaryLabel, primaryEnabled, onPrimary, secondaryLabel, secondaryEnabled, onSecondary },
      step1Error: currentStep === 'TYPE' ? step1Res.message : null,
      step3Error: currentStep === 'SUBMIT' ? step3Res.message : null,
      canSubmitForm: step1Res.isValid && step2Res.isValid && step3Res.isValid
    }

    return basePayload
  }, 'example-113:computed:ui-master-bridge [IS_OPTIMIZED=1]')

  // АСИНХРОННЫЙ РЕСУРС ОТПРАВКИ ФОРМЫ (Стейт-машина интегрирована напрямую!):
  // Ресурс финальной отправки формы остается без изменений,
  // он просто лениво считает filesCount из обновленного файл-менеджера!
  public submitResource = this.engine.resource<{ ok: boolean; message?: string }, number>(
    async (triggerValue, abortSignal) => {
      // ЖЕСТКИЙ ПРЕДОХРАНИТЕЛЬ НА СТАРТ!
      // Если triggerValue равен 0 — это означает холостой запуск эффекта ядра при монтировании.
      if (triggerValue === 0) {
        throw new Error(`Запрос по валидации триггера (значение ${triggerValue})`)
        // ЛИБО: Мы немедленно прерываем выполнение и возвращаем null, полностью блокируя fetch в браузере (оба варианта верны)
        // return null;
      }

      const formData = new FormData()
      // Лениво собираем payload из шагов формы, если это реальный боевой клик (triggerValue > 0)
      const payload = this.engine.untrack(() => {
        // Пробегаемся по файлам, достаем данные из их ресурсов и фильтруем только валидные строки
        const claimIds: string[] = this.step2.fileManager.state.items
          .map(item => item.uploadResource.value.data?.data?.claimId)
          .filter((id): id is string => typeof id === 'string' && id.trim() !== '')

        return {
          type: this.step1.fields.appealType,
          title: this.step1.fields.ticketTitle,
          desc: this.step3.fields.description,
          filesCount: this.step2.fileManager.state.items.length,
          claimIds: claimIds,
        }
      })

      formData.append('type', payload.type)
      formData.append('title', payload.title)
      formData.append('desc', payload.desc)
      formData.append('filesCount', String(payload.filesCount))
      formData.append('claimIds', JSON.stringify(payload.claimIds))

      const response = await fetch('http://local.devtool-1.ru/express-helper/mg/mocks/request/administrative', {
        method: 'POST',
        body: formData,
        signal: abortSignal,
      })

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    },
    this.submitTrigger,
    {
      name: 'example-113:resource:final-submit',
      validateBeforeFetch: () => {
        // 1. Стартовый холостой тик при монтировании компонента (trigger === 0)
        // Возвращаем строго false.
        // WIP_CORE: Модернизированное ядро тихо заблокирует fetch,
        // оставит error: null, и НЕ породит каскадных ререндеров (их и так нет без StrictMode)
        if (this.submitTrigger.value === 0) return false

        // 2. Боевой клик по кнопке "Отправить" (trigger > 0)
        // Если форма не прошла валидацию — возвращаем текстовую строку.
        // Ядро переведет ресурс в стейт ошибки и выведет её на экран в красный блок.
        if (!this.uiBridge.value.canSubmitForm) {
          return 'Форма не прошла валидацию перед отправкой.'
        }

        // 3. Данные консистентны, пропускаем запрос в сеть!
        return true
      },
      // Валидация ответа сервера по ТЗ: если сервер вернет ok: false — ресурс ядра упадет в стейт error!
      responseValidate: (resData) => {
        if (!resData || resData.ok !== true) {
          return resData?.message || 'API ERR: Поле ok не равно true'
        }
        return true
      }
    }
  )

  // СИНХРОННЫЙ СЕТЕВОЙ МОСТ (Оркестратор Стейт-Машины):
  // Он слушает изменение корневого реактивного сигнала состояния ресурса .value.
  // Так как вызов происходит синхронно в микрозадаче шедулера ядра на финише fetch,
  // мутация currentStep отработает идеально, и uiBridge мгновенно переключит экран!
  private _syncMachineWithNetwork = this.engine.effect(() => {
    const resState = this.submitResource.value

    // ЗАЩИТА ЭФФЕКТА: Если триггер равен 0, значит, боевой отправки не было.
    // Игнорируем стартовое состояние ресурса, сохраняя currentStep в положении 'TYPE'!
    if (this.submitTrigger.value === 0) return

    switch (true) {
    case !!resState.error:
      this.machine.currentStep = 'ERROR_PAGE'
      break
    case !resState.loading && !!resState.data && resState.data.ok === true:
      // Сеть вернула честный успех -> сохраняем сообщение и уходим на ШАГ УСПЕХА!
      this.machine.successMessage = resState.data?.message || 'Форма успешно отправлена!'
      this.machine.currentStep = 'SUCCESS_PAGE'
      break
    default:
      break
    }
  }, 'example-113:effect:network-bridge [IS_OPTIMIZED=1]')

  // Методы обновления полей Proxy объектов
  public setAppealType = (val: string) => { this.step1.fields.appealType = val }
  public setTicketTitle = (val: string) => { this.step1.fields.ticketTitle = val }
  public setDescription = (val: string) => { this.step3.fields.description = val }
  public setAgreeToTerms = (val: boolean) => { this.step3.fields.agreeToTerms = val }

  public submitForm() {
    this.submitTrigger.value += 1
  }

  public resetForm() {
    this.step1.clear()
    this.step2.clear()
    this.step3.clear()
    this.submitTrigger.value = 0
    this.machine.successMessage = null
  }

  public destroy() {
    this.uiBridge.destroy()
    this.resetForm()
  }

  public removeFile = (id: string) => {
    this.step2.fileManager.removeFile(id)
  }
}
