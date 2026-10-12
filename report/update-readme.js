import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const readmePath = path.resolve(__dirname, 'reactive-framework-test-suite', 'README.md')
const resultsDir = path.resolve(__dirname, '_test-results.copy')

function generateMatrixReport() {
  try {
    console.log(`🔍 Проверка README.md: ${readmePath}`)
    console.log(`🔍 Сканирование матрицы тестов в: ${resultsDir}`)

    if (!fs.existsSync(readmePath)) {
      console.error(`❌ Файл README.md отсутствует по ${readmePath}`)
      return
    }

    let totalTests = 0
    let passedTests = 0
    let failedTests = 0
    let tableRows = []

    if (fs.existsSync(resultsDir)) {
      const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'))

      files.forEach(file => {
        const rawData = fs.readFileSync(path.join(resultsDir, file), 'utf8')
        const data = JSON.parse(rawData)

        // Извлекаем имя дисциплины из названия файла
        const suiteName = file.replace('.json', '').replace(/_/g, ' ')
        const fileTotal = data.numTotalTests || data.total || 0
        const filePassed = data.numPassedTests || data.passed || 0
        const fileFailed = data.numFailedTests || data.failed || 0

        totalTests += fileTotal
        passedTests += filePassed
        failedTests += fileFailed

        const statusSign = fileFailed > 0 ? '❌ FAILED' : '🟢 PASS'
        tableRows.push(`| ${suiteName} | ${fileTotal} | ${filePassed} | ${fileFailed} | ${statusSign} |`)
      })
    }

    let reportMarkdown = `### 📊 Матрица интеграционных бенчмарков платформы\n\n` +
      `| Дисциплина спецификации | Всего | Пройдено | Упало | Статус |\n` +
      `| :--- | :---: | :---: | :---: | :---: |\n` +
      tableRows.join('\n') +
      `\n\n**Итоговый агрегированный статус:**\n` +
      `*   **Всего интеграционных сценариев:** ${totalTests}\n` +
      `*   **Успешно верифицировано:** ${passedTests} 🎉\n` +
      `*   **Оставшиеся падения:** ${failedTests}`

    let readmeContent = fs.readFileSync(readmePath, 'utf8')
    const startMarker = '<!-- TEST_RESULTS_START -->'
    const endMarker = '<!-- TEST_RESULTS_END -->'

    const startIndex = readmeContent.indexOf(startMarker)
    const endIndex = readmeContent.indexOf(endMarker)

    if (startIndex !== -1 && endIndex !== -1) {
      const before = readmeContent.substring(0, startIndex + startMarker.length)
      const after = readmeContent.substring(endIndex)
      readmeContent = `${before}\n\n${reportMarkdown}\n\n${after}`
      fs.writeFileSync(readmePath, readmeContent, 'utf8')
      console.log('──> README.md успешно актуализирован сводной матрицей бенчмарков!')
    } else {
      console.warn(`⚠️ Маркеры тестов <!-- TEST_RESULTS_START --> не найдены в README.md`)
    }
  } catch (err) {
    console.error('Ошибка при генерации отчёта матрицы:', err)
  }
}

generateMatrixReport()
