import React from 'react'
import clsx from 'clsx'
import styles from './ui.button.module.scss'

// Расширяем стандартные пропсы обычной HTML-кнопки
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outlined' | 'contained';
  colorType?: 'primary' | 'secondary' | 'danger'; // Три цветовые вариации
  fullWidth?: boolean;
  isLoading?: boolean; // Лоадер, завязанный на сигналы движка
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'outlined',
  colorType = 'primary',
  fullWidth = false,
  isLoading = false,
  className = '',
  disabled,
  style,
  ...props
}) => {

  // Собираем динамические классы на основе CSS-модулей
  const buttonClasses = clsx(
    styles.btn,
    styles.neonBtn,
    styles[`neonBtn--${colorType}`],
    styles[`neonBtn--${variant}`],
    className
  )

  // Управляем шириной кнопки декларативно через инлайн-стили
  const combinedStyle: React.CSSProperties = {
    ...style,
    display: fullWidth ? 'block' : 'inline-block',
    width: fullWidth ? '100%' : 'auto',
  }

  return (
    <button
      {...props}
      style={combinedStyle}
      className={buttonClasses}
      disabled={disabled || isLoading} // Автоматически дизейблим кнопку при отправке
    >
      {/* Если идет загрузка — рендерим CSS-спиннер */}
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}

      <span>{children}</span>
    </button>
  )
}
