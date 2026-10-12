const fs = require('fs')
const path = require('path')

let ReactiveEngine
try {
  // 1. Пытаемся импортировать из продакшн-пакета согласно вашей спецификации
  const packageCore = require('@pravosleva/reactive-engine')
  ReactiveEngine = packageCore.ReactiveEngine
} catch (e) {
  // 2. Локальный фолбек для dev-окружения, если пакет еще не слинкован в node_modules
  try {
    const localCore = require('../dist/core/core') // или '../src/core/core' в зависимости от сборки
    ReactiveEngine = localCore.ReactiveEngine
  } catch (err) {
    console.warn('⚠️ Движок ReactiveEngine не найден в @pravosleva/reactive-engine или dist. Отчет будет сгенерирован без валидации конструктора.')
  }
}

const readmePath = path.join(__dirname, '../README.md')
const testResultsPath = path.join(__dirname, './test-results.json')

function generateReport() {
  try {
    let testSummary = 'Данные о прогоне тестов отсутствуют.'
    if (fs.existsSync(testResultsPath)) {
      const rawData = fs.readFileSync(testResultsPath, 'utf8')
      const results = JSON.parse(rawData)
      
      testSummary = `### 📊 Статистика тестов платформы\n` +
        `*   **Всего тестов:** ${results.numTotalTests || 0}\n` +
        `*   **Успешно пройдены (PASS):** ${results.numPassedTests || 0}\n` +
        `*   **Провалены (FAILED):** ${results.numFailedTests || 0}\n` +
        `*   **Время прогона:** ${results.startTime ? (Date.now() - results.startTime) + 'ms' : 'N/A'}`
    }

    if (!fs.existsSync(readmePath)) {
      console.error('❌ Файл README.md не найден по пути:', readmePath)
      return
    }

    let readmeContent = fs.readFileSync(readmePath, 'utf8')
    const startMarker = '<!-- TEST_RESULTS_START -->'
    const endMarker = '<!-- TEST_RESULTS_END -->'
    
    const startIndex = readmeContent.indexOf(startMarker)
    const endIndex = readmeContent.indexOf(endMarker)

    if (startIndex !== -1 && endIndex !== -1) {
      const before = readmeContent.substring(0, startIndex + startMarker.length)
      const after = readmeContent.substring(endIndex)
      readmeContent = `${before}\n\n${testSummary}\n\n${after}`
      fs.writeFileSync(readmePath, readmeContent, 'utf8')
      console.log('──> README.md успешно актуализирован данными из @pravosleva/reactive-engine')
    } else {
      console.warn('⚠️ Маркеры тестов <!-- TEST_RESULTS_START --> не найдены в README.md')
    }
  } catch (err) {
    console.error('Ошибка при генерации отчёта README:', err)
  }
}

generateReport()
