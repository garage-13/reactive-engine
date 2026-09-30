import React, { useState, useId } from 'react'
import clsx from 'clsx'
import styles from './ui.file-input.module.scss'

interface FileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  variant?: 'outlined' | 'contained';
  colorType?: 'primary' | 'secondary';
  placeholder?: string;
  chosenFiles?: File[]; // Список валидированных файлов из реактивного графа
}

export const FileInput: React.FC<FileInputProps> = ({
  label,
  variant = 'outlined',
  colorType = 'primary',
  className = '',
  id,
  placeholder = 'Нажмите или перетащите файлы для загрузки',
  chosenFiles = [],
  onChange,
  ...props
}) => {
  const defaultId = useId()
  const inputId = id || defaultId

  // Локальный стейт для подсветки рамки при Drag & Drop
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = () => {
    setIsDragOver(false)
    // Нативный инпут сам перехватит файлы, так как он находится поверх дропзоны
  }

  const wrapperClasses = clsx(
    styles['neonFileInput-wrapper'],
    styles[`neonFileInput-wrapper--${colorType}`],
    styles[`neonFileInput-wrapper--${variant}`],
    className,
    { 'drag-over': isDragOver } // Класс для изменения стилей при перетаскивании
  )

  return (
    <div
      className={wrapperClasses}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Скрытый нативный инпут, доступный для сбора через FormData */}
      <input
        {...props}
        type="file"
        id={inputId}
        onChange={onChange}
        className={styles.hiddenInput}
      />

      {/* Кастомное интерактивное текстовое поле-дропзона */}
      <div className={styles.dropzoneArea}>
        {chosenFiles.length > 0 ? (
          <span style={{ fontWeight: 'bold' }}>
            {chosenFiles.length === 1
              ? `📁 Выбран 1 файл`
              : `📁 Выбрано файлов: ${chosenFiles.length}`
            }
          </span>
        ) : (
          <span className={styles.placeholderText}>
            {placeholder}
          </span>
        )}
      </div>

      {/* Плавающий фиксированный лейбл */}
      {!!label && (
        <label htmlFor={inputId} className={styles['neonFileInput-label']}>
          {label}
        </label>
      )}
    </div>
  )
}
