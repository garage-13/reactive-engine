// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ router }) {
    if (typeof window !== 'undefined') {

      // Переменные для хранения состояния скролла
      let scrolled50 = false
      let scrolled90 = false

      // 1. Определяем функцию для скролла
      const handleScroll = () => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight
        const scrollPercent = (scrollTop / docHeight) * 100

        if (scrollPercent >= 50 && !scrolled50) {
          scrolled50 = true
          window.gtag?.('event', 'page_scroll_depth', { page_path: window.location.pathname, depth_percentage: 50 })
        }
        if (scrollPercent >= 90 && !scrolled90) {
          scrolled90 = true
          window.gtag?.('event', 'page_scroll_depth', { page_path: window.location.pathname, depth_percentage: 90 })
        }
      }

      // 2. Определяем функцию для копирования
      const handleCopy = () => {
        const selection = window.getSelection()?.toString() || ''
        if (selection.length > 15) {
          window.gtag?.('event', 'code_copy', {
            page_path: window.location.pathname,
            code_snippet: selection.substring(0, 40).replace(/\s+/g, ' ')
          })
        }
      }

      // 3.1. Создаем функцию-обработчик кликов по всему сайту
      const handleGlobalClick = (event: MouseEvent) => {
        // Ищем ближайший тег <a> от места клика
        const target = (event.target as HTMLElement).closest('a')

        switch (target?.href) {
          case 'https://t.me/bash_exp_ru/3393':
            if (typeof window.gtag === 'function') {
              window.gtag('event', 'telegram_click', {
                page_path: window.location.pathname,
                target_url: target.href,
                post_id: '3393'
              })
              // console.log('[GA4] Затрекан клик по ссылке на Telegram!')
            }
            break;
          default:
            break
        }
      }

      // Инициализируем слушатели при первой загрузке приложения
      window.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('copy', handleCopy)
      // 3.2 Вешаем один глобальный слушатель на весь документ
      // Он не будет дублироваться при переходах между страницами, так как объект document один на всю сессию
      document.addEventListener('click', handleGlobalClick)

      // Хук роутера: срабатывает при КАЖДОМ переходе
      router.onBeforeRouteChange = (to) => {
        // А) Сбрасываем триггеры скролла для НОВОЙ страницы
        scrolled50 = false
        scrolled90 = false

        // Б) Трекаем просмотр страницы (наш прошлый шаг)
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'page_view', { page_path: to, page_title: document.title })
        }
      }
    }
  }
} satisfies Theme
