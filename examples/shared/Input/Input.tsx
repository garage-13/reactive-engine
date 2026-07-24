import clsx from 'clsx'
import styles from '../../ui.input.module.scss'
import React, { CSSProperties, useId } from 'react';

// Расширяем стандартные пропсы обычного HTML-инпута
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  variant?: 'outlined' | 'contained';
  colorType?: 'primary' | 'secondary';
  style?: CSSProperties;
}

export const Input: React.FC<InputProps> = ({
  label,
  variant = 'outlined',
  colorType = 'primary',
  className = '',
  id,
  placeholder, // Извлекаем, чтобы случайно не перезаписать поведение
  ...props
}) => {
  // Генерируем уникальный id, если он не передан снаружи (для связки input + label)
  const defaultId = useId();
  const inputId = id || defaultId;

  // Формируем динамические классы для обертки на основе CSS-модулей
  const wrapperClasses = clsx(
    styles['neonInput-wrapper'],
    styles[`neonInput-wrapper--${colorType}`],
    styles[`neonInput-wrapper--${variant}`],
  );

  return (
    <div className={wrapperClasses}>
      <input
        {...props}
        id={inputId}
        className={`${styles.neonInput} ${className}`}
        placeholder=" " // Строго обязательно для работы селектора :not(:placeholder-shown)
      />
      {
        !!label && (
          <label htmlFor={inputId} className={styles['neonInput-label']}>
            {label}
          </label>
        )
      }
    </div>
  );
};
