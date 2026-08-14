// vite.config.umd.ts
import { defineConfig, UserConfig } from 'vite'
import path from 'path'

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
        exports: "named"
      }
    }
  }
}) satisfies UserConfig
