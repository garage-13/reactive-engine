// vite.config.umd.ts
import { defineConfig, UserConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import pkg from './package.json'

const bannerText = `/*!
 * @pravosleva/reactive-engine v${pkg.version}
 * High-performance transactional reactive engine with microtask batching.
 *
 * @license MIT
 * @author pravosleva <selection4test@google.com>
 * @homepage https://pravosleva.pro/reactive-engine
 *
 * @contact Telegram Channel: https://t.me/bash_exp_ru/3393
 * @contact Developer Telegram: https://t.me/pravosleva
 */
`

export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    // Custom hook-plugin: Принудительное внедрение баннера после записи файла на диск
    {
      name: 'umd-banner-injector',
      closeBundle() {
        const umdPath = path.resolve(__dirname, 'dist/reactive-engine.umd.js')

        try {
          // Проверяем, что UMD файл успешно сгенерирован
          if (fs.existsSync(umdPath)) {
            const fileContent = fs.readFileSync(umdPath, 'utf8')

            // Если баннер ещё не добавлен (предохранитель от дублирования)
            if (!fileContent.startsWith('/**\n * @pravosleva/reactive-engine')) {
              // Склеиваем баннер и оригинальный код бандла
              fs.writeFileSync(umdPath, bannerText + fileContent, 'utf8')
              console.log('✅ [UMD Banner Injector]: Паспорт бандла успешно вшит в начало файла!')
            }
          }
        } catch (err) {
          console.error('❌ [UMD Banner Injector Error]: Не удалось записать баннер', err)
        }
      }
    }
  ],
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
      }
    }
  }
}) satisfies UserConfig
