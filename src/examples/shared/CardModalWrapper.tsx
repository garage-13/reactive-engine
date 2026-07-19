import { useState, ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import baseClasses from '../baseClasses.common.module.scss'
import btnClasses from '../baseClasses.buttons.module.scss'

interface CardModalWrapperProps {
  title: string;
  description?: string;
  buttonText?: string;
  children: ReactNode;
  className?: string;
  footerText?: string;
  useTwoColumns?: boolean;
}

export const CardModalWrapper = ({
  title,
  description,
  buttonText = 'Show',
  children,
  className,
  footerText,
  useTwoColumns,
}: CardModalWrapperProps) => {
  const [isOpen, setIsOpen] = useState(false)

  // Блокируем прокрутку страницы, когда модалка открыта
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2, className, { [baseClasses['unit--wide']]: useTwoColumns })}
    >
      {/* Метка-заголовок карточки в вашем фирменном стиле */}
      <div className={baseClasses.absoluteUnitLabel}>{title}</div>

      {/* Описание внутри карточки, если передано */}
      {description && <p style={{ fontSize: 'bold', color: 'gray', margin: 0, fontFamily: 'system-ui' }}>{description}</p>}

      {/* Кнопка-триггер для открытия */}
      <div>
        <button
          onClick={() => setIsOpen(true)}
          className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >
          {buttonText}
        </button>
      </div>

      {/* Модальное окно через Портал */}
      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: '24px',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setIsOpen(false)} // Закрытие при клике на оверлей
        >
          <div
            style={{
              // backgroundColor: '#fff', // Белый фон (можно сменить на темный)
              border: '2px solid lightgray',
              borderRadius: '32px',
              minWidth: '320px',
              maxWidth: 'calc(100vw - 24px - 24px)',
              maxHeight: 'calc(100vh - 24px - 24px)',
              position: 'relative',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column', // Превращаем в flex-контейнер для изоляции скролла
              overflow: 'hidden' // Запрещаем скролл на самом верхнем контейнере карточки
            }}
            onClick={(e) => e.stopPropagation()} // Предотвращаем закрытие при клике внутри модалки
          >
            {/* ФИКСИРОВАННАЯ ШАПКА */}
            <div
              style={{
                position: 'relative',
                padding: '16px 52px 16px 24px', // Оставляем 48px справа, чтобы текст не налезал на крестик
                borderBottom: '2px solid lightgray', // Мягкая разделяющая линия (опционально)
                flexShrink: 0 // Запрещаем шапке сжиматься
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 0, paddingRight: '24px' }}>{title}</h3>

              {/* Кнопка закрытия (крестик) теперь позиционируется относительно фиксированной шапки */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  position: 'absolute',
                  top: '0px',
                  right: '16px',
                  transform: 'translateY(45%)',
                  background: 'none',
                  border: '2px solid lightgray',
                  width: '35px',
                  height: '35px',
                  borderRadius: '50%',
                  color: 'gray',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: 1,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <span>✕</span>
              </button>
            </div>

            {/* СКРОЛЛЯЩАЯСЯ ОБЛАСТЬ С КОНТЕНТОМ */}
            <div
              style={{
                padding: '24px',
                overflowY: 'auto', // Скролл теперь живет только здесь
                flexGrow: 1 // Заставляем контент занимать всё оставшееся пространство по высоте
              }}
            >
              <div className={baseClasses.stack2}>
                {children}
              </div>
            </div>

            {
              !!footerText && (
                <div
                  style={{
                    fontFamily: 'system-ui',
                    fontSize: 'small',
                    padding: '16px 24px', // Оставляем 48px справа, чтобы текст не налезал на крестик
                    borderTop: '2px solid lightgray', // Мягкая разделяющая линия (опционально)
                    flexShrink: 0 // Запрещаем шапке сжиматься
                  }}
                >{footerText}</div>
              )
            }

          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
