// vite.config.umd.ts
import { defineConfig, UserConfig } from 'vite'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Говорим Vite НЕ затирать результаты предыдущей сборки ES/CJS в dist/
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      // Строго ОДНА точка входа — чистый JS-функционал ядра
      entry: path.resolve(__dirname, 'src/core/index.ts'),
      name: "ReactiveEngineLib",
      formats: ['umd'],
      fileName: () => 'reactive-engine.umd.js'
    },
    rollupOptions: {
      // Исключаем абсолютно все внешние фреймворки, чтобы бандл весил копейки
      external: ['react', 'react-dom', 'vue', '@angular/core'],
      output: {
        exports: "named",
        banner: `/**
 * @pravosleva/reactive-engine v${pkg.version}
 * High-performance transactional reactive engine with microtask batching.
 *
 * @license MIT
 * @author pravosleva <selection4test@google.com>
 * @homepage https://pravosleva.pro/reactive-engine
 *
 * @contact Telegram Channel: https://t.me/bash_exp_ru/3393
 * @contact Developer Telegram: https://t.me/pravosleva
 */`
      }
    }
  }
}) satisfies UserConfig
