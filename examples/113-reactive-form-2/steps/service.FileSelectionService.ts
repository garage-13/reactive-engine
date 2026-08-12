import { AbstractService, Resource, CleanupFn } from '@pravosleva/reactive-engine'

// Описываем структуру ответа сервера
interface UploadResponse {
  ok: boolean;
  fileId?: string;
  data?: {
    claimId?: string;
  };
  message?: string;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  sizeStr: string;
  // КАЖДЫЙ ФАЙЛ ВЛАДЕТ СOБСТВЕННЫМ РЕСУРСОМ ЯДРА!
  uploadResource: Resource<UploadResponse>;
  unsubscribeFn: CleanupFn;
}

export interface FileSystemState {
  items: FileItem[];
  totalSize: number;
  globalStatus: 'idle' | 'processing' | 'ready' | 'error';
  errorMessage: string | null;
}

export class FileSelectionService extends AbstractService {
  private readonly MAX_FILES = 5
  private readonly MAX_FILE_SIZE_MB = 10
  private readonly MAX_TOTAL_SIZE_MB = 25

  public state = this.engine.reactive<FileSystemState>({
    items: [],
    totalSize: 0,
    globalStatus: 'idle',
    errorMessage: null
  }, 'example-113:file-system:reactive')

  // Свойство для хранения эффекта авто-отслеживания статусов
  private statusTrackerEffect: (() => void) | null = null

  /**
   * Метод добавления, валидации и автоматического старта поштучной загрузки файлов
   */
  public selectFiles(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return

    this.state.errorMessage = null
    this.state.globalStatus = 'processing'

    if (this.state.items.length + fileList.length > this.MAX_FILES) {
      this.state.errorMessage = `[Ошибка лимита]: Разрешено загружать не более ${this.MAX_FILES} файлов одновременно.`
      this.state.globalStatus = 'error'
      return
    }

    const newItems: FileItem[] = []
    let incomingBatchSize = 0

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]

      // МИНИМАЛЬНАЯ ДОРАБOТКА: ВАЛИДАЦИЯ НА ВЫБOР ОДНОГO И ТОГО ЖЕ ФАЙЛА
      // Сканируем текущий Proxy-массив items в поисках полного совпадения метаданных
      const isDuplicateAlready = this.state.items.some(
        (existingItem) => existingItem.name === file.name && existingItem.size === file.size
      )
      if (isDuplicateAlready) {
        this.state.errorMessage = `[Дубликат]: Файл "${file.name}" уже прикреплен к форме. Выберите другой файл.`
        this.state.globalStatus = this.state.items.length > 0 ? 'ready' : 'idle'
        return // Прерываем весь пакет, защищая ядро от паразитных дублирующих ресурсов
      }

      const sizeInMb = file.size / 1024 / 1024

      if (sizeInMb > this.MAX_FILE_SIZE_MB) {
        this.state.errorMessage = `[Ошибка размера]: Файл "${file.name}" превышает допустимый лимит в ${this.MAX_FILE_SIZE_MB} MB.`
        this.state.globalStatus = 'error'
        return
      }

      incomingBatchSize += file.size
      const fileId = crypto.randomUUID?.() || Math.random().toString(36).substring(2)

      // СОЗДАЕМ ИНДИВИДУАЛЬНЫЙ РЕСУРС ЗАПРОСА ДЛЯ КАЖДOГО ФАЙЛА:
      // Передаем плоский сигнал-триггер со значением 1, чтобы фетчер стартанул немедленно при создании!
      const startTrigger = this.engine.signal<number>(1, `example-113:signal:file-trigger:${fileId}`)

      const uploadResource = this.engine.resource<UploadResponse, number>(
        async (triggerVal, abortSignal) => {
          if (triggerVal === 0) return { ok: false }

          // Симулируем честный POST запрос с AbortSignal контроллером прерывания!
          const formData = new FormData()
          formData.append('file', file)

          const queryParams = new URLSearchParams({
            _responseDelay: '2000',
            _makeScenario: JSON.stringify({
              _freeDataMutation: [
                {
                  targetMutationPath: 'claimId', // На уровне SW будет мутировано поле data в ответе
                  targetActionCode: 'set_random_string',
                }
              ]
            }),
          })

          const response = await fetch(`http://local.devtool-1.ru/express-helper/mg/mocks/tmp_file?${queryParams}`, {
            method: 'POST',
            body: formData,
            signal: abortSignal // 👈 Передаем сигнал отмены! При удалении файла запрос прервется!
          })

          if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`)
          }

          return await response.json()
        },
        startTrigger,
        {
          name: `example-113:resource:file-upload:${fileId}`,
          // ВГРАДЕННАЯ ВАЛИДАЦИЯ ОТВЕТА СЕРВЕРА ПО ТЗ:
          // Если сервер вернул ok: false — ресурс ядра автоматически перейдет в стейт error!
          responseValidate: (responseData) => {
            switch (true) {
            case !responseData || typeof responseData.data?.claimId !== 'string':
              return `Ошибка валидации: сервер не вернул корректный идентификатор claimId (получено: typeof responseData.claimId=${typeof responseData.data?.claimId}, ожидается строка)${!!responseData?.message ? `; Original message from backend: ${responseData?.message}` : ''}`
            case responseData.data?.claimId?.trim() === '':
              return `Ошибка валидации: сервер не вернул корректный идентификатор claimId (получено: responseData.claimId=${String(responseData.data?.claimId)}, ожидается строка)${!!responseData?.message ? `; Original message from backend: ${responseData?.message}` : ''}`
            default:
              return true
            }
          }
        }
      )

      // ОФОРМЛЯЕМ ХОЛОСТУЮ ПОДПИСКУ ДЛЯ ИНИЦИАЛИЗАЦИИ И ЭКСТРАКЦИИ ДЕСТРУКТOРА:
      // Метод .subscribe() регистрирует слушателя в ядре и возвращает CleanupFn.
      // Вызов этой функции мгновенно убьет эффект ресурса и сделает abort() fetch-запроса!
      const unsubscribeFn = uploadResource.subscribe(() => {
        // Пассивный слушатель для удержания эффекта в живых на уровне сессии файла
      })

      newItems.push({
        id: fileId,
        name: file.name,
        size: file.size,
        sizeStr: `${(file.size / 1024).toFixed(2)} KB`,
        uploadResource,
        unsubscribeFn, // Сохраняем CleanupFn
      })
    }

    const futureTotalSizeMb = (this.state.totalSize + incomingBatchSize) / 1024 / 1024
    if (futureTotalSizeMb > this.MAX_TOTAL_SIZE_MB) {
      this.state.errorMessage = `[Ошибка объема]: Суммарный вес файлов превышает лимит в ${this.MAX_TOTAL_SIZE_MB} MB.`
      this.state.globalStatus = 'error'
      return
    }

    this.state.items.push(...newItems)
    this.state.totalSize += incomingBatchSize

    // Перезапускаем изолированный эффект авто-отслеживания статусов файлов!
    // Он будет жить своей жизнью внутри файл-менеджера и точечно менять globalStatus Proxy.
    if (this.statusTrackerEffect) this.statusTrackerEffect()

    // Запускаем реактивное отслеживание глобального статуса файл-менеджера
    // this.updateGlobalStatus();

    this.statusTrackerEffect = this.engine.effect(() => {
      this.updateGlobalStatus()
    }, 'example-113:effect:files-watcher:_ [IS_OPTIMIZED=1]')
  }

  /**
   * Метод точечного удаления файла из реактивного Proxy-массива.
   * Автоматически отменяет HTTP-запрос благодаря деструкции ресурса!
   */
  public removeFile(id: string): void {
    const index = this.state.items.findIndex(item => item.id === id)
    if (index === -1) return

    const removedItem = this.state.items[index]

    // ЖЕСТКИЙ АВТO-ABORT ЗАПРОСА:
    // Вызываем сохраненную функцию отписки подписки ядра.
    // Она синхронно прерывает fetch-запрос в браузере через встроенный AbortController!
    if (typeof removedItem.unsubscribeFn === 'function') {
      removedItem.unsubscribeFn()
    }

    this.state.totalSize = Math.max(0, this.state.totalSize - removedItem.size)
    this.state.items.splice(index, 1)

    this.updateGlobalStatus()
  }

  /**
   * Вспомогательный метод перерасчета общего статуса на основе стейтов ресурсов
   */
  public updateGlobalStatus(): void {
    if (this.state.items.length === 0) {
      this.state.globalStatus = 'idle'
      this.state.errorMessage = null
      return
    }

    // Читаем реактивные состояния каждого индивидуального ресурса файлов
    const statuses = this.state.items.map(item => {
      // Прямое безопасное чтение геттеров ресурса
      if (item.uploadResource.error) return 'error'
      if (item.uploadResource.loading) return 'uploading'
      return 'success'
    })

    if (statuses.includes('error')) {
      this.state.globalStatus = 'error'
    } else if (statuses.includes('uploading')) {
      this.state.globalStatus = 'processing'
    } else {
      this.state.globalStatus = 'ready'
    }
  }

  public clear(): void {
    // При общем сбросе формы гарантированно отменяем все летящие HTTP-запросы
    this.state.items.forEach(item => {
      if (typeof item.unsubscribeFn === 'function') {
        item.unsubscribeFn()
      }
    })
    this.state.items = []
    this.state.totalSize = 0
    this.state.globalStatus = 'idle'
    this.state.errorMessage = null
  }
}
