import importX from 'eslint-plugin-import-x'

export default [
  {
    // Правило применяется СТРОГО к файлам внутри src
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'import-x': importX,
    },
    rules: {
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
              importNames: ['@src', '@pravosleva/reactive-engine', '~'],
              message: 'Внутри папки src используйте только относительные пути (./ или ../). Алиасы запрещены.',
            }
          ],
        },
      ],
    },
  },
];
