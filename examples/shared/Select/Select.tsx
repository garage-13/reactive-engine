import React, { useId } from 'react';
import styles from '../../ui.select.module.scss';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  variant?: 'outlined' | 'contained';
  colorType?: 'primary' | 'secondary';
  fullWidth?: boolean; // Добавили флаг для управления шириной, так как в SCSS убрано width: 100%
}

export const Select: React.FC<SelectProps> = ({
  label,
  variant = 'outlined',
  colorType = 'primary',
  fullWidth = false,
  className = '',
  id,
  children,
  value,
  ...props
}) => {
  const defaultId = useId();
  const selectId = id || defaultId;

  // Лейбл поднимается, если есть выбранное валидное значение
  const hasValue = value !== undefined && value !== null && value !== '';

  // Сборка классов CSS-модулей
  const wrapperClasses = [
    styles['neonSelect-wrapper'],
    styles[`neonSelect-wrapper--${colorType}`],
    styles[`neonSelect-wrapper--${variant}`],
    hasValue ? styles['has-value'] : '',
  ].join(' ');

  // Динамический стиль для управления шириной контейнера
  const wrapperStyle: React.CSSProperties = fullWidth ? { display: 'block', width: '100%' } : {};

  return (
    <div className={wrapperClasses} style={wrapperStyle}>
      <select
        {...props}
        id={selectId}
        value={value}
        className={`${styles.neonSelect} ${className}`}
      >
        {children}
      </select>
      {!!label && (
        <label htmlFor={selectId} className={styles['neonSelect-label']}>
          {label}
        </label>
      )}
    </div>
  );
};
