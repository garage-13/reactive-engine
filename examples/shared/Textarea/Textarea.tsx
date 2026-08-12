import clsx from 'clsx'
import styles from '../../ui.input.module.scss'
import React, { CSSProperties, useId } from 'react'

// Расширяем стандартные пропсы HTML-текстарии
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  variant?: 'outlined' | 'contained';
  colorType?: 'primary' | 'secondary';
  style?: CSSProperties;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  variant = 'outlined',
  colorType = 'primary',
  className = '',
  id,
  placeholder, // Извлекаем, чтобы не сломать логику селектора :not(:placeholder-shown)
  ...props
}) => {
  // Генерируем уникальный id, если он не передан
  const defaultId = useId()
  const textareaId = id || defaultId

  // Формируем динамические классы для обертки (используем те же стили, что и для инпута)
  const wrapperClasses = clsx(
    styles['neonInput-wrapper'],
    styles[`neonInput-wrapper--${colorType}`],
    styles[`neonInput-wrapper--${variant}`],
  )

  return (
    <div className={wrapperClasses}>
      <textarea
        {...props}
        id={textareaId}
        className={`${styles.neonInput} ${className}`}
        placeholder=" " // Строго обязательно для работы селектора :not(:placeholder-shown)
      />
      {
        !!label && (
          <label htmlFor={textareaId} className={styles['neonInput-label']}>
            {label}
          </label>
        )
      }
    </div>
  )
}
