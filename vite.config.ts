import { defineConfig, UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import path from 'path'
import type { PreRenderedChunk } from 'rollup'

export default defineConfig({
  base: "./",
  plugins: [
    dts({
      // bundleTypes: true, // ВНИМАНИЕ: Для мульти-входа (multi-entry) эту опцию лучше отключить,
      // иначе плагин попытается склеить типы ядра и реакта в один файл, что сломает пути.
      insertTypesEntry: true,
      // Исключаем примеры из генерации деклараций типов основного билда
      exclude: ['examples/**/*'],
      cleanVueFileName: true,
      // Принудительно заставляем плагин смотреть на корень исходников,
      // чтобы структура .d.ts файлов идеально совпала со структурой .mjs файлов
      tsconfigPath: './tsconfig.json',
      compilerOptions: {
        declarationMap: true, // Поможет IDE точнее находить методы при Ctrl+Клик
      },
    }),
    react(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      '~': path.resolve(__dirname, './examples'), // Ведет в папку examples в корне проекта
      '@src': path.resolve(__dirname, './src'),
      '@pravosleva/reactive-engine': path.resolve(__dirname, './src'),
      '@pravosleva/reactive-engine/react': path.resolve(__dirname, './src'),
      '@dist': path.resolve(__dirname, './dist'),
    },
  },
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/core/index.ts'),
        'react/index': path.resolve(__dirname, 'src/react/index.ts')
      },
      name: "ReactiveEngineLib",
    },
    rollupOptions: {
      // Исключаем react из финального бандла, чтобы не дублировать код
      external: ["react", "react-dom"],
      output: [
        {
          format: 'es',
          exports: "named",
          // Сохраняем структуру папок, предотвращая появление папки shared
          preserveModules: true,
          // Базовая папка, относительно которой строятся пути (чтобы в dist не было лишней вложенности src/)
          preserveModulesRoot: 'src',
          entryFileNames: (chunkInfo: PreRenderedChunk) => {
            // Если файл изначально из core/, убираем эту вложенность для сохранения обратной совместимости корневого импорта
            if (chunkInfo.name.startsWith('core/')) {
              return `${chunkInfo.name.replace('core/', '')}.mjs`;
            }
            return `${chunkInfo.name}.mjs`;
          }
        },
        {
          format: 'cjs',
          exports: "named",
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: (chunkInfo: PreRenderedChunk) => {
            if (chunkInfo.name.startsWith('core/')) {
              return `${chunkInfo.name.replace('core/', '')}.cjs`;
            }
            return `${chunkInfo.name}.cjs`;
          }
        }
      ] as any,
      // {
      //   // Принудительно генерируем чистый ESM/CJS без лишних оберток
      //   interop: "auto",
      //   // Обеспечивает корректную работу дефолтных экспортов в гибридных бандлах
      //   exports: "named",
      //   globals: {
      //     react: "React",
      //     "react-dom": "ReactDOM",
      //   },
      //   // Настройка нормальных расширений файлов (.mjs и .cjs)
      //   entryFileNames: (chunkInfo: PreRenderedChunk, format: string) => {
      //     return chunkInfo.name === 'index'
      //       ? 'index.[format]'
      //       : '[name].[format]'; // превратится в react/index.es.js -> переименуем через имя
      //   },
      //   // Чтобы расширения были именно .mjs и .cjs, как у вас сейчас:
      //   chunkFileNames: '[name]-[hash].js',
      //   assetFileNames: '[name].[ext]',
      //   // Корректное переименование форматов под ваши текущие расширения
      //   extmapping: {
      //     es: 'mjs',
      //     cjs: 'cjs'
      //   }
      // } as any, // Приведение к any убирает ошибку overload на объединении типов
    },
  },
  server: {
    proxy: {
      // Все запросы, начинающиеся с /gdebenzin-vite-proxy, пойдут на gdebenzin.app
      '/gdebenzin-vite-proxy': {
        target: 'https://gdebenzin.app',
        changeOrigin: true,
        // Отрезаем префикс /gdebenzin-vite-proxy перед отправкой на бэкенд
        rewrite: (path) => path.replace(/^\/gdebenzin-vite-proxy/, ''),
        headers: {
          // Имитируем, что запрос пришел напрямую с сайта
          'Referer': 'https://gdebenzin.app',
          'Origin': 'https://gdebenzin.app'
        }
      },
    }
  },
} satisfies UserConfig);
