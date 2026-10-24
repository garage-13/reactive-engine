import { defineConfig, UserConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
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
    // Custom hook-plugin: Внедрение баннера и копирование результатов сборки в документацию
    {
      name: 'umd-banner-and-copier',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist')
        const targetDocsDir = path.resolve(__dirname, 'docs/public/build')

        const umdFileName = 'reactive-engine.umd.js'
        const mapFileName = 'reactive-engine.umd.js.map'

        const targetUmdPath = path.join(distDir, umdFileName)
        const targetMapPath = path.join(distDir, mapFileName)

        try {
          // --- ЭТАП 1: Внедрение баннера в UMD-файл ---
          if (fs.existsSync(targetUmdPath)) {
            const fileContent = fs.readFileSync(targetUmdPath, 'utf8')

            // Предохранитель от дублирования баннера
            if (!fileContent.startsWith('/*!\n * @pravosleva/reactive-engine')) {
              fs.writeFileSync(targetUmdPath, bannerText + fileContent, 'utf8')
              console.log('✅ [UMD Banner Injector]: Паспорт бандла успешно вшит в начало файла!')
            }

            // -- Расчет и вывод размера файла
            const finalBuffer = fs.readFileSync(targetUmdPath)
            const sizeInKb = (finalBuffer.length / 1024).toFixed(2)

            // Рассчитываем размер со сжатием Gzip
            const gzipBuffer = zlib.gzipSync(finalBuffer)
            const gzipSizeInKb = (gzipBuffer.length / 1024).toFixed(2)

            console.log(`\n📊 [Bundle Size Monitor] — ${umdFileName}:`)
            console.log(`   ├── Физический размер: \x1b[36m${sizeInKb} KB\x1b[0m`)
            console.log(`   └── Сжатый (Gzip):     \x1b[32m${gzipSizeInKb} KB\x1b[0m\n`)
            // --

            // --- ЭТАП 2: Копирование файлов в документацию VitePress ---
            // Убеждаемся, что целевая папка docs/public/build существует
            if (!fs.existsSync(targetDocsDir)) {
              fs.mkdirSync(targetDocsDir, { recursive: true })
            }

            // Копируем сам UMD-бандл
            fs.copyFileSync(targetUmdPath, path.join(targetDocsDir, umdFileName))
            console.log(`🚀 [Docs Copier]: Файл ${umdFileName} успешно скопирован в docs/public/build/`)

            // Копируем карту кода (sourcemap), если она сгенерирована
            if (fs.existsSync(targetMapPath)) {
              fs.copyFileSync(targetMapPath, path.join(targetDocsDir, mapFileName))
              console.log(`🚀 [Docs Copier]: Файл ${mapFileName} успешно скопирован в docs/public/build/`)
            }
          }
        } catch (err) {
          console.error('❌ [UMD Plugin Error]: Произошла ошибка во время обработки бандла', err)
        }
      }
    }
  ],
  build: {
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/core/index.ts'),
      name: "ReactiveEngineLib",
      formats: ['umd'],
      fileName: () => 'reactive-engine.umd.js'
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'vue', '@angular/core'],
      output: {
        exports: "named",
      }
    }
  }
}) satisfies UserConfig
