import { defineConfig } from 'vitepress'
import { withPwa } from '@vite-pwa/vitepress'
import { loadEnv } from 'vite'

// 🎯 Шаг 1. Безопасно загружаем переменные окружения ДО экспорта объекта конфигурации
// Так как здесь нет контекста `mode`, мы принудительно проверяем как dev, так и production режимы
const env = {
  ...loadEnv('development', process.cwd(), ''),
  ...loadEnv('production', process.cwd(), '')
}

const rawPublicUrl = env.VITE_PUBLIC_URL

// Шаг 2. Безопасное форматирование базового URL
let PUBLIC_URL = '/'
if (rawPublicUrl && rawPublicUrl !== 'undefined') {
  PUBLIC_URL = `${rawPublicUrl}/`.replace(/\/+\$/, '/')
}

// Считываем ключ из переменных окружения (например, из .env.production.local)
// Если переменной нет, можно указать фолбек-строку или оставить пустой
const GA4_KEY = process.env.VITE_GA4_KEY || 'G-XXXXXXXXXX'

// Тест вывода в терминал при сборке
console.log('\n--- [CHECK] VITE_GA4_KEY VALUE:', GA4_KEY, '---\n')

// https://vitepress.dev/reference/site-config
export default withPwa(defineConfig({
  title: 'Reactive Engine',
  description: 'Логическое ядро проекта',
  base: PUBLIC_URL,

  pwa: {
    outDir: '.vitepress/dist', // Куда складывать sw.js при сборке
    registerType: 'autoUpdate', // Автоматически обновлять кэш при пуше новой доки
    includeAssets: ['rocket-thruster-animated-120x120.svg'],

    manifest: false, // Отключаем автогенерацию, так как мы используем наш готовый docs/public/manifest.json

    workbox: {
      globPatterns: ['**/*.{css,js,html,svg,png,ico,txt,woff2}'],
      // Стратегия кэширования для страниц документации:
      // Всегда мгновенно отдаем из кэша (для офлайна), но в фоне проверяем обновления на сервере
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.includes(`${process.env.VITE_PUBLIC_URL}/`),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'vitepress-docs-cache',
            expiration: {
              maxEntries: 150,
              maxAgeSeconds: 60 * 60 * 24 * 30 // Кэшируем на 30 дней
            }
          }
        }
      ]
    }
  },
  head: [
    // 0.1 Подключение внешнего скрипта библиотеки GA4
    [
      'script',
      {
        async: '', // Пустой атрибут async пишется именно так
        src: `https://www.googletagmanager.com/gtag/js?id=${GA4_KEY}`
      }
    ],
    // 0.2 Инициализирующий инлайн-скрипт
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
    ],

    // 1. Базовые настройки PWA и Манифест (с ?v=3 для гарантированного сброса старого кэша)
    ['link', { rel: 'manifest', href: `${process.env.VITE_PUBLIC_URL}/manifest.json` }],
    ['meta', { name: 'theme-color', content: '#ff8e53' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'RE Docs' }],

    // 2. Фавиконки для вкладок браузера (Ретина + Вектор)
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${process.env.VITE_PUBLIC_URL}/rocket-thruster-animated-120x120.svg` }],
    ['link', { rel: 'apple-touch-icon', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-icon-180.png` }],

    // 3. Пакет экранов заставок Apple Splash Screens (Забираем из вывода генератора)
    // Каждая строка жестко привязана к медиа-запросу конкретного iPhone/iPad
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2048-2732.jpg`, media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2732-2048.jpg`, media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1668-2388.jpg`, media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2388-1668.jpg`, media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1536-2048.jpg`, media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2048-1536.jpg`, media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1125-2436.jpg`, media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2436-1125.jpg`, media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1242-2688.jpg`, media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-2688-1242.jpg`, media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-828-1792.jpg`, media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1792-828.jpg`, media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-750-1334.jpg`, media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1334-750.jpg`, media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-640-1136.jpg`, media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' }],
    ['link', { rel: 'apple-touch-startup-image', href: `${process.env.VITE_PUBLIC_URL}/pwa/apple-splash-1136-640.jpg`, media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' }]
    // Вы можете докинуть сюда остальные строки из консоли по аналогии, если требуется точечная поддержка старых iPad mini/iPhone SE
  ],

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
          { text: 'Введение', link: '/guides' },
          { text: 'Старт с UI-слоем', link: '/guides/quick-start' },
          { text: 'Декораторы', link: '/decorators/' },
          { text: 'Примеры', link: '/examples/' },
        ],
        // Боковое меню для русской версии
        sidebar: {
          '/guides/': [
            {
              text: 'Руководство',
              items: [
                { text: 'Введение', link: '/guides' },
                { text: 'Старт с UI-слоем', link: '/guides/quick-start' },
                // { text: 'React', link: '/react' },
                // { text: 'Хуки для React', link: '/react/hooks' },
                { text: 'Философия движка', link: '/guides/philosophy' },
                // { text: 'Подробное описание', link: '/guides/introduction' },
              ]
            }
          ],
          '/methods/': [
            {
              text: 'Публичные методы (wip)',
              items: [
                { text: 'Обзор', link: '/methods/' },
                { text: 'reactive', link: '/methods/reactive' },
              ]
            }
          ],
          '/decorators/': [
            {
              text: 'Декораторы',
              items: [
                { text: 'Обзор', link: '/decorators/' },
                { text: 'withCache', link: '/decorators/withCache' },
                { text: 'withDebounce', link: '/decorators/withDebounce' },
                { text: 'withThrottle', link: '/decorators/withThrottle' },
                { text: 'withThrottleComputed', link: '/decorators/withThrottleComputed' },
                { text: 'withThrottleAndCache', link: '/decorators/withThrottleAndCache' },
                { text: 'withLongPolling', link: '/decorators/withLongPolling' },
                { text: 'withStaleWhileRevalidate', link: '/decorators/withStaleWhileRevalidate' },
              ]
            }
          ],
          '/react/examples': [
            {
              // text: 'Примеры с React',
              items: [
                { text: 'Примеры с React', link: '/react/examples' },
                { text: 'Обзор хуков', link: '/react/hooks/' },
              ]
            }
          ],
          '/react/hooks/': [
            {
              // text: 'React хуки',
              items: [
                { text: 'Примеры с React', link: '/react/examples' },
                { text: 'Обзор хуков', link: '/react/hooks/' },
                { text: 'engine.use', link: '/react/hooks/use' },
                { text: 'useReactiveValue', link: '/react/hooks/useReactiveValue' },
                { text: 'useReactiveSubscription', link: '/react/hooks/useReactiveSubscription' },
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
                { text: '115: Связывание инстансов (3)', link: '/examples/computed/115' },
                { text: '116: Связывание инстансов (2)', link: '/examples/computed/116' },
                { text: '117: Связывание инстансов (1)', link: '/examples/computed/117' },
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
          { text: 'Guides', link: '/en/guides' },
          // { text: 'React (Quick start)', link: '/en/guides/quick-start/react' },
          { text: 'Decorators', link: '/en/decorators/' },
        ],
        // Боковое меню для английской версии
        sidebar: {
          '/en/guides/': [
            {
              text: 'Guide',
              items: [
                { text: 'Guides', link: '/en/guides' },
                // { text: 'React (Quick start)', link: '/en/guides/quick-start/react' },
                { text: 'Philosophy', link: '/en/guides/philosophy' },
                { text: 'Introduction', link: '/guides/introduction' },
              ]
            }
          ],
          '/en/methods/': [
            {
              text: 'Public methods (wip)',
              items: [
                { text: 'Main', link: '/en/methods/' },
                { text: 'reactive', link: '/en/methods/reactive' },
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
}
))
