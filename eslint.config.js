import importX from 'eslint-plugin-import-x'
import tsParser from '@typescript-eslint/parser'
// import tsPlugin from '@typescript-eslint/eslint-plugin' // 1. Импортируем плагин

export default [
  {
    // Глобальная настройка отступов для всех поддерживаемых файлов в проекте
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      // Говорим ESLint, как правильно читать TypeScript код
      parser: tsParser,
    },
    rules: {
      // Задает строго 2 пробела для отступов
      'indent': ['error', 2],
      // Запрещает использовать точки с запятой везде, где это возможно
      'semi': ['error', 'never']
    }
  },
  {
    // Правило применяется СТРОГО к файлам внутри src
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'import-x': importX,
    },
    rules: {
      // Отключаем базовое правило semi для TS-файлов...
      // 'semi': 'off',
      // ...и заменяем его на TS-версию, чтобы не было багов с типами и интерфейсами
      // '@typescript-eslint/semi': ['error', 'never'],

      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              // Запрещаем любые абсолютные/алиасные импорты, которые ведут наружу или на самих себя через алиас
              target: './src',
              from: './examples',
              message: 'Нельзя импортировать файлы из папки examples внутрь ядра библиотеки (src).',
            },
            {
              target: './src',
              from: './src',
              // Этот паттерн отловит попытку импортировать из @src внутри самого src
              // importNames: ['@src', '@pravosleva/reactive-engine', '~'],
              message: 'Внутри папки src используйте только относительные пути (./ или ../). Алиасы запрещены.',
            }
          ],
        },
      ],
    },
  },
]
