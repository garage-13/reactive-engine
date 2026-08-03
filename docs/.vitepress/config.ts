import { defineConfig } from 'vitepress'

// Гарантируем, что base ВСЕГДА будет содержать слэш на конце: '/reactive-engine/'
const PUBLIC_URL = process.env.VITE_PUBLIC_URL
  ? `${process.env.VITE_PUBLIC_URL}/`.replace(/\/+$/, '/')
  : '/reactive-engine'
// Считываем ключ из переменных окружения (например, из .env.production.local)
// Если переменной нет, можно указать фолбек-строку или оставить пустой
const GA4_KEY = process.env.VITE_GA4_KEY || 'G-XXXXXXXXXX'

// ВРЕМЕННЫЙ ТЕСТ: Выведет ключ прямо в терминал при сборке
console.log('\n--- [CHECK] VITE_GA4_KEY VALUE:', GA4_KEY, '---\n')

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Reactive Engine",
  description: "Логическое ядро проекта",
  base: PUBLIC_URL,

  // Настройка локализации (Мультиязычность)
  locales: {
    // -----------------------------------------------------------------
    // КОРНЕВОЙ ЯЗЫК (Русский) — доступен по путям /ru/ или прямо из корня /
    // -----------------------------------------------------------------
    root: {
      label: 'Русский',
      lang: 'ru',
      // link - Можно не указывать
      themeConfig: {
        // НАВИГАЦИЯ ДЛЯ РУССКОЙ ВЕРСИИ
        nav: [
          { text: 'Руководство', link: '/guides/' },
          { text: 'Декораторы', link: '/decorators/' },
          { text: 'Хуки', link: '/hooks/' }
        ],
        // Боковое меню для русской версии
        sidebar: {
          '/guides/': [
            {
              text: 'Руководство',
              items: [{ text: 'Введение', link: '/guides/introduction' }]
            }
          ],
          '/decorators/': [
            {
              text: 'Декораторы (RU)',
              items: [
                { text: 'Обзор', link: '/decorators/' },
                { text: 'withCache', link: '/decorators/withCache' },
                { text: 'withDebounce', link: '/decorators/withDebounce' },
                { text: 'withThrottleAndCahce', link: '/decorators/withThrottleAndCahce' },
                { text: 'withLongPolling', link: '/decorators/withLongPolling' }
              ]
            }
          ],
          '/hooks/': [
            {
              text: 'Хуки (RU)',
              items: [
                { text: 'Обзор', link: '/hooks/' },
                { text: 'useReactiveSubscription', link: '/hooks/useReactiveSubscription' },
                { text: 'useReactiveValue', link: '/hooks/useReactiveValue' },
              ]
            }
          ],
        },
        docFooter: {
          prev: 'Предыдущая страница',
          next: 'Следующая страница'
        },
        lastUpdatedText: 'Последнее обновление', // Текст перед датой
        lastUpdated: {
          formatOptions: {
            dateStyle: 'long',   // Выведет: 24 июля 2026 г.
            timeStyle: 'short'   // Выведет: 13:22
          }
        },
      },
    },

    // -----------------------------------------------------------------
    // АНГЛИЙСКИЙ ЯЗЫК — все файлы должны лежать в папке docs/en/...
    // -----------------------------------------------------------------
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/', // Ссылка на префикс папки английской версии
      themeConfig: {
        // НАВИГАЦИЯ ДЛЯ АНГЛИЙСКОЙ ВЕРСИИ
        nav: [
          { text: 'Guide', link: '/en/guides/introduction' },
          { text: 'Decorators', link: '/en/decorators/' },
          // { text: 'API Reference', link: '/en/api/' }
        ],
        // Боковое меню для английской версии
        sidebar: {
          '/en/guides/': [
            {
              text: 'Guide',
              items: [{ text: 'Introduction', link: '/en/guides/introduction' }]
            }
          ],
          '/en/decorators/': [
            {
              text: 'Decorators (EN)',
              items: [
                { text: 'Overview', link: '/en/decorators/' },
                { text: 'withCache', link: '/en/decorators/withCache' },
                { text: 'withDebounce', link: '/en/decorators/withDebounce' },
                { text: 'withThrottleAndCahce', link: '/en/decorators/withThrottleAndCahce' },
                { text: 'withLongPolling', link: '/en/decorators/withLongPolling' }
              ]
            }
          ],
        },
        docFooter: {
          prev: 'Previous page',
          next: 'Next page'
        },
        lastUpdatedText: 'Last updated', // Текст перед датой
        lastUpdated: {
          formatOptions: {
            dateStyle: 'medium', // Выведет: Jul 24, 2026
            timeStyle: 'short'  // Выведет: 1:22 PM
          }
        }
      },
    }
  },

  // Массив head отвечает за инжекты в тег <head> каждой страницы
  head: [
    // 1. Подключение внешнего скрипта библиотеки GA4
    [
      'script',
      {
        async: '', // Пустой атрибут async пишется именно так
        src: `https://www.googletagmanager.com/gtag/js?id=${GA4_KEY}`
      }
    ],
    // 2. Инициализирующий инлайн-скрипт
    [
      'script',
      {},
      `
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());

        // Флаг send_page_view: false отключает автоматический первый трек,
        // так как наш роутер в теме сам отправит событие при инициализации приложения
        gtag('config', '${GA4_KEY}', { send_page_view: false });
      `
    ]
  ],

  themeConfig: {
    // Включаем встроенный локальный поиск
    search: {
      provider: 'local',
      options: {
        // Конфигурация переводов для поиска
        locales: {
          // 'root' соответствует корневому языку (в вашем случае — русский)
          root: {
            translations: {
              button: {
                buttonText: 'Поиск',
                buttonAriaLabel: 'Поиск'
              },
              modal: {
                displayDetails: 'Показать подробный список',
                resetButtonTitle: 'Сбросить поиск',
                backButtonTitle: 'Закрыть поиск',
                noResultsText: 'Нет результатов по запросу',
                footer: {
                  selectText: 'выбрать',
                  navigateText: 'перейти',
                  closeText: 'закрыть'
                }
              }
            }
          },
          // 'en' соответствует английской версии (папка /en/)
          en: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search'
              },
              modal: {
                displayDetails: 'Display detailed list',
                resetButtonTitle: 'Reset search',
                backButtonTitle: 'Close search',
                noResultsText: 'No results for',
                footer: {
                  selectText: 'to select',
                  navigateText: 'to navigate',
                  closeText: 'to close'
                }
              }
            }
          }
        }
      }
    }
  },
})
