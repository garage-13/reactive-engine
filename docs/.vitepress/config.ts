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
  title: 'Reactive Engine',
  description: 'Логическое ядро проекта',
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
          { text: 'Руководство', link: '/guides/introduction' },
          { text: 'Быстрый старт', link: '/guides/quick-start' },
          { text: 'Декораторы', link: '/decorators/' },
          { text: 'Хуки', link: '/hooks/' },
          { text: 'Примеры и сущности', link: '/examples/' },
        ],
        // Боковое меню для русской версии
        sidebar: {
          '/guides/': [
            {
              text: 'Руководство',
              items: [
                { text: 'Введение', link: '/guides/introduction' },
                { text: 'Быстрый старт', link: '/guides/quick-start' },
                { text: 'Философия (подробно)', link: '/guides' },
              ]
            }
          ],
          '/decorators/': [
            {
              text: 'Декораторы (RU)',
              items: [
                { text: 'Обзор', link: '/decorators/' },
                { text: 'withCache', link: '/decorators/withCache' },
                { text: 'withDebounce', link: '/decorators/withDebounce' },
                { text: 'withThrottleAndCache', link: '/decorators/withThrottleAndCache' },
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
          '/examples/': [
            {
              text: 'Все примеры и сущности',
              items: [
                { text: 'Сигналы', link: '/examples/signal' },
                { text: 'Вычисляемые значения', link: '/examples/computed' },
                { text: 'Ресурсы', link: '/examples/resource' },
              ]
            }
          ],
          '/examples/signal/': [
            {
              text: 'Сигналы',
              items: [
                // { text: 'Все примеры и сущности', link: '/examples' },
                { text: '001: Счетчик', link: '/examples/signal/001' },
                { text: '002: Аудиоплеер', link: '/examples/signal/002' },
              ]
            }
          ],
          '/examples/computed/': [
            {
              text: 'Вычисляемые значения',
              items: [
                // { text: 'Все примеры и сущности', link: '/examples' },
                { text: '100: Удвоенный счетчик', link: '/examples/computed/100' },
              ]
            }
          ],
          '/examples/resource/': [
            {
              text: 'Ресурсы',
              items: [
                // { text: 'Все примеры и сущности', link: '/examples' },
                { text: '200: Зависимость от одного сигнала', link: '/examples/resource/200' },
                { text: '201: Зависимость от нескольких синалов', link: '/examples/resource/201' },
                { text: '202: Ресурс с настройками "из коробки" (isExponentialBackoffEnabled)', link: '/examples/resource/202' },
                { text: '203: Ресурс с настройками "из коробки" (timeout)', link: '/examples/resource/203' },
                { text: '205: Карта заправок + Leaflet + кластеризация', link: '/examples/resource/205' },
                { text: '211: Ресурс + withDebounce', link: '/examples/resource/211' },
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
          { text: 'Introduction', link: '/en/guides/introduction' },
          { text: 'Quick start', link: '/en/guides/quick-start' },
          { text: 'Decorators', link: '/en/decorators/' },
        ],
        // Боковое меню для английской версии
        sidebar: {
          '/en/guides/': [
            {
              text: 'Guide',
              items: [
                { text: 'Introduction', link: '/en/guides/introduction' },
                { text: 'Quick start', link: '/en/guides/quick-start' },
                { text: 'Philosophy', link: '/en/guides' },
              ]
            }
          ],
          '/en/decorators/': [
            {
              text: 'Decorators (EN)',
              items: [
                { text: 'Overview', link: '/en/decorators/' },
                { text: 'withCache', link: '/en/decorators/withCache' },
                { text: 'withDebounce', link: '/en/decorators/withDebounce' },
                { text: 'withThrottleAndCache', link: '/en/decorators/withThrottleAndCache' },
                { text: 'withLongPolling', link: '/en/decorators/withLongPolling' }
              ]
            }
          ],
          '/en/examples/': [
            {
              text: 'All examples',
              items: [
                { text: 'Signals', link: '/en/examples/signal' },
                // { text: 'Вычисляемые значения', link: '/en/examples/computed' },
                // { text: 'Ресурсы', link: '/en/examples/resource' },
              ]
            }
          ],
          '/en/examples/signal/': [
            {
              text: 'Signals',
              items: [
                // { text: 'All examples', link: '/en/examples' },
                { text: '001: Counter', link: '/en/examples/signal/001' },
                // { text: '002: Аудиоплеер', link: '/en/examples/signal/002' },
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
