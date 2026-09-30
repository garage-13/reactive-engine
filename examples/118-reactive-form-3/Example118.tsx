import React, { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/shared/Button/ui.button.module.scss'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'
import { Button, FileInput, Input, Select } from '~/shared' // Импортируем кастомные компоненты
import clsx from 'clsx'

interface UserProfileForm {
  name: string;
  meta: {
    age: number;
    role: string;
  };
}

interface FileValidationConfig {
  maxFiles: number;
  maxSingleSize: number;
  maxTotalSize: number;
}

// --- Сервис валидации файлов ---
class FileValidationService extends AbstractService {
  private config: FileValidationConfig = {
    maxFiles: 3,
    maxSingleSize: 2 * 1024 * 1024,
    maxTotalSize: 5 * 1024 * 1024,
  }

  public files = this.engine.signal<File[]>([], 'files:list')
  public fileError = this.engine.signal<string>('', 'files:error-message')

  public setConfig(customConfig: Partial<FileValidationConfig>) {
    this.config = { ...this.config, ...customConfig }
  }

  public validateAndSetFiles(fileList: File[]) {
    this.fileError.value = ''
    const validFiles = fileList.filter(file => file.name && file.size > 0)

    if (validFiles.length === 0) {
      this.files.value = []
      return
    }

    if (validFiles.length > this.config.maxFiles) {
      this.fileError.value = `Превышено макс. количество файлов: разрешено не более ${this.config.maxFiles}.`
      this.files.value = []
      return
    }

    let currentTotalSize = 0
    for (const file of validFiles) {
      if (file.size > this.config.maxSingleSize) {
        const maxSizeMb = (this.config.maxSingleSize / (1024 * 1024)).toFixed(1)
        this.fileError.value = `Файл "${file.name}" слишком большой. Макс. размер одного файла: ${maxSizeMb} MB.`
        this.files.value = []
        return
      }
      currentTotalSize += file.size
    }

    if (currentTotalSize > this.config.maxTotalSize) {
      const maxTotalMb = (this.config.maxTotalSize / (1024 * 1024)).toFixed(1)
      this.fileError.value = `Суммарный размер файлов превышает лимит в ${maxTotalMb} MB.`
      this.files.value = []
      return
    }

    this.files.value = validFiles
  }

  public clearFiles() {
    this.files.value = []
    this.fileError.value = ''
  }
}

// --- Основной сервис профиля пользователя ---
class UserProfileLogicv2 extends AbstractService {
  public fileService = this.engine.inject(FileValidationService)

  public user = this.engine.reactive<UserProfileForm>({
    name: 'Иван',
    meta: {
      age: 25,
      role: 'Разработчик'
    }
  }, 'example-118:user')

  public uiBridge = this.engine.computed(() => ({
    name: this.user.name,
    age: this.user.meta.age,
    role: this.user.meta.role
  }), 'example-118:computed:ui-bridge')

  public updateReactiveStateFromForm(formElement: HTMLFormElement) {
    const formData = new FormData(formElement)

    this.user.name = String(formData.get('name') || '')
    this.user.meta.role = String(formData.get('role') || '')

    const parsedAge = parseInt(String(formData.get('age')), 10)
    this.user.meta.age = isNaN(parsedAge) ? 0 : parsedAge

    const files = formData.getAll('user_files') as File[]
    this.fileService.validateAndSetFiles(files)
  }

  public celebrateBirthday = () => {
    this.user.meta.age += 1
  }
}

const engine = new ReactiveEngine({
  logger: { isEnabled: true, traceTime: true, filter: /.*/ }
})

// --- Компонент представления ---
export const Example118 = () => {
  const logic = engine.inject(UserProfileLogicv2)
  const fileService = logic.fileService

  useEffect(() => {
    fileService.setConfig({
      maxFiles: 3,
      maxSingleSize: 1 * 1024 * 1024,
      maxTotalSize: 2 * 1024 * 1024,
    })
  }, [fileService])

  const user = engine.use(logic.uiBridge)
  const chosenFiles = engine.use(fileService.files)
  const fileError = engine.use(fileService.fileError)

  const formRef = useRef<HTMLFormElement>(null)

  // Двусторонняя синхронизация полей формы при внешних изменениях (например, клик на кнопку дня рождения)
  useEffect(() => {
    if (formRef.current) {
      const ageInput = formRef.current.elements.namedItem('age') as HTMLInputElement
      if (ageInput && ageInput.value !== String(user.age)) {
        ageInput.value = String(user.age)
      }
    }
  }, [user.age])

  useEffect(() => {
    if (chosenFiles.length === 0 && formRef.current) {
      const fileInput = formRef.current.elements.namedItem('user_files') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    }
  }, [chosenFiles])

  /**
   * Сквозной обработчик изменений формы, полностью совместимый с React 19+.
   * Использует BaseSyntheticEvent вместо устаревшего FormEvent.
   */
  const handleFormChange = (e: React.BaseSyntheticEvent) => {
    // Метод updateReactiveStateFromForm по-прежнему принимает HTMLFormElement
    logic.updateReactiveStateFromForm(e.currentTarget)
  }

  const renderCountRef = useRef(0)
  renderCountRef.current += 1

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Uncontrolled Form with Custom Shared Components (Example 118)</div>

      {/* Панель телеметрии */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a24', padding: '6px 12px', borderRadius: '8px', border: '1px solid #252530', fontSize: 'small', fontFamily: 'monospace' }}>
        <span style={{ color: '#aaa' }}>Телеметрия UI-слоя</span>
        <span style={{ color: '#42b883', fontWeight: 'bold' }}>
          Рендеров компонента: <span style={{ color: '#00b4d8' }}>{renderCountRef.current}</span>
        </span>
      </div>

      {/* Форма с делегированием событий */}
      <form style={{ margin: 0 }} ref={formRef} onChange={handleFormChange} onSubmit={(e) => e.preventDefault()} className={baseClasses.stack2}>

        {/* Кастомный инпут имени */}
        <Input
          type="text"
          name="name"
          // label="Имя пользователя"
          variant="outlined"
          colorType="primary"
          defaultValue={logic.user.name}
        />

        {/* Кастомный инпут возраста */}
        <Input
          type="number"
          name="age"
          // label="Возраст (лет)"
          variant="outlined"
          colorType="primary"
          defaultValue={logic.user.meta.age}
        />

        {/* Кастомный селект роли */}
        <Select
          name="role"
          // label="Роль в системе"
          variant="outlined"
          colorType='primary'
          fullWidth
          defaultValue={logic.user.meta.role}
        >
          <option value="Разработчик">Разработчик</option>
          <option value="Тимлид">Тимлид</option>
          <option value="Архитектор">Архитектор</option>
        </Select>

        {/* Блок загрузки файлов */}
        <FileInput
          name="user_files"
          multiple
          // label="Документы профиля"
          variant="outlined"
          colorType="primary"
          chosenFiles={chosenFiles} // Пробрасываем список файлов из сигнала для изменения текста
        />

        {chosenFiles.length > 0 && (
          <div style={{ fontSize: 'small', color: '#42b883' }}>
            <strong>✓ Выбранные файлы ({chosenFiles.length}):</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {chosenFiles.map((file, index) => (
                <li key={index}>{file.name} <span style={{ color: '#666' }}>({(file.size / 1024).toFixed(1)} KB)</span></li>
              ))}
            </ul>
          </div>
        )}

        {/* Вывод ошибки валидации файлов */}
        {!!fileError && (
          <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
            ⚠️ {fileError}
          </div>
        )}
      </form>

      <div style={{ display: 'flex', gap: '16px' }}>
        <button
          onClick={logic.celebrateBirthday}
          className={clsx(
            btnClasses.btn,
            btnClasses.neonBtn,
            btnClasses['neonBtn--secondary'],
            btnClasses['neonBtn--outlined']
          )}
        >
          🍰 Отпраздновать день рождения (+1)
        </button>
        {chosenFiles.length > 0 && (
          <Button
            type="button"
            variant="outlined"
            colorType="danger"
            fullWidth
            onClick={() => fileService.clearFiles()}
          >
            Удалить файлы
          </Button>
        )}
      </div>
    </div>
  )
}
