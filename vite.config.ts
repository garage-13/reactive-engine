import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'
import type { PreRenderedChunk } from 'rollup'
import { visualizer } from 'rollup-plugin-visualizer'
import pkj from './package.json'

export default defineConfig({
  base: "./",
  plugins: [
    dts({
      insertTypesEntry: true,
      exclude: ['examples/**/*'],
      tsconfigPath: './tsconfig.json',
      // Говорим Vite НЕ вшивать код пакета внутрь дистрибутива вашей библиотеки
      // Отключаем интеграцию с vue-tsc, так как у нас в src/ только чистый TypeScript
      // Это предотвратит автоматический поиск пакета @vue/language-core
      compilerOptions: {
        // Указываем компилятору типов обрабатывать только стандартный TS
        allowNonTsExtensions: false,
      }
    }),
    react(),
    vue(),
    visualizer({
      open: false,             // Автоматически открывать отчет в браузере? (true/false)
      filename: path.resolve(__dirname, 'docs/public/build/stats.html'),  // Имя файла с интерактивным графиком веса зависимостей
      gzipSize: true,          // Считать и показывать размер с учетом Gzip compression
      brotliSize: true,        // Считать и показывать размер с учетом Brotli compression
      title: `ReactiveEngine v${pkj.version}`,
      template: 'treemap',
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'vue'],
    alias: {
      '~': path.resolve(__dirname, './examples'), // Ведет в папку examples в корне проекта
      '@src': path.resolve(__dirname, './src'),
      '@pravosleva/reactive-engine': path.resolve(__dirname, './src'),
      '@pravosleva/reactive-engine/react': path.resolve(__dirname, './src/react'),
      '@pravosleva/reactive-engine/vue': path.resolve(__dirname, './src/vue'),
      '@dist': path.resolve(__dirname, './dist'),
    },
  },
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'react/index': path.resolve(__dirname, 'src/react/index.ts'),
        'vue/index': path.resolve(__dirname, 'src/vue/index.ts'),
        'angular/index': path.resolve(__dirname, 'src/angular/index.ts'),
      },
      name: 'ReactiveEngineLib',
    },
    rollupOptions: {
      // Исключаем react, vue (возможно, что-то еще) из финального бандла,
      // 1. чтобы не дублировать код
      // 2. чтобы клиент брал это из своих node_modules
      external: ['react', 'react-dom', 'vue', '@angular/core'],
      output: [
        {
          format: 'es',
          exports: "named",
          preserveModules: true,
          // Базовая папка, относительно которой строятся пути (чтобы в dist не было лишней вложенности src/)
          preserveModulesRoot: 'src',
          entryFileNames: (chunkInfo: PreRenderedChunk) => {
            // Если файл изначально из core/, убираем эту вложенность для сохранения обратной совместимости корневого импорта
            if (chunkInfo.name.startsWith('core/')) {
              return `${chunkInfo.name.replace('core/', '')}.mjs`
            }
            return `${chunkInfo.name}.mjs`
          }
        },
        {
          format: 'cjs',
          exports: "named",
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: (chunkInfo: PreRenderedChunk) => {
            if (chunkInfo.name.startsWith('core/')) {
              return `${chunkInfo.name.replace('core/', '')}.cjs`
            }
            return `${chunkInfo.name}.cjs`
          }
        }
      ] as any
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
  test: {
    // Добавляем сабмодуль бенчмарка в список исключений!
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Полностью блокируем сканирование и запуск тестов внутри папки сабмодуля
      '**/report/reactive-framework-test-suite/**',
    ],
  },
})
