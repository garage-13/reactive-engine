import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import path from 'path'
import fs from 'fs'

describe('⚛️ Reactive Engine — Локальный Сьют Спецификации Dynamic Graphs', () => {

  function createRandom(seed: number) {
    let value = seed
    return () => {
      value = (value * 16807) % 2147483647
      return (value - 1) / 2147483646
    }
  }

  function runDynamicStressTest(iterations: number) {
    const engine = new ReactiveEngineCore({ logger: { isEnabled: false } })
    const width = 10
    const totalLayers = 10
    const staticFraction = 0.75
    const nSources = 6
    const readFraction = 0.2

    const rng = createRandom(42)
    const sources: any[] = []
    for (let i = 0; i < nSources; i++) {
      sources.push(engine.signal(i))
    }

    let checkSum = 0
    const effectSpy = vi.fn()

    const startTime = performance.now()

    for (let iter = 0; iter < iterations; iter++) {
      engine.batch(() => {
        const randomSourceIndex = Math.floor(rng() * nSources)
        sources[randomSourceIndex].value = iter + randomSourceIndex

        let currentLayer: any[] = []
        for (let i = 0; i < width; i++) {
          currentLayer.push(
            engine.computed(() => {
              let sum = 0
              for (const src of sources) {
                sum += src.value
              }
              return sum
            })
          )
        }

        for (let layer = 1; layer < totalLayers; layer++) {
          const nextLayer: any[] = []
          const previousLayerSnapshot = [...currentLayer]

          for (let i = 0; i < width; i++) {
            const isStatic = rng() < staticFraction
            const parentIndex1 = Math.floor(rng() * width)
            const parentIndex2 = Math.floor(rng() * width)
            const parentIndex3 = Math.floor(rng() * width)

            if (isStatic) {
              nextLayer.push(
                engine.computed(() => {
                  return (
                    previousLayerSnapshot[parentIndex1].value +
                    previousLayerSnapshot[parentIndex2].value
                  )
                })
              )
            } else {
              nextLayer.push(
                engine.computed(() => {
                  const condition = previousLayerSnapshot[parentIndex1].value % 2 === 0
                  return condition
                    ? previousLayerSnapshot[parentIndex2].value
                    : previousLayerSnapshot[parentIndex3].value
                })
              )
            }
          }
          currentLayer = nextLayer
        }

        const cleanups: Array<() => void> = []
        for (let i = 0; i < currentLayer.length; i++) {
          const node = currentLayer[i]
          const dispose = engine.effect(() => {
            effectSpy()
            if (rng() < readFraction) {
              checkSum += node.value
            }
          })
          cleanups.push(dispose)
        }

        for (const dispose of cleanups) {
          dispose()
        }
      })
    }

    const duration = performance.now() - startTime
    return { duration, effectSpy, checkSum }
  }

  function generateSparkline(values: number[]): string {
    if (values.length === 0) return '[Нет данных]'
    if (values.length === 1) return '■'
    const ticks = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█']
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min

    return values
      .map(v => {
        if (range === 0) return '▅'
        const scale = (v - min) / range
        const index = Math.floor(scale * (ticks.length - 1))
        return ticks[index]
      })
      .join(' ')
  }

  // Универсальный движок рендеринга интеллектуального Dashboard
  function evaluateAndReportPerformance(config: {
    suiteLabel: string
    suffix: string
    iterations: number
    fallbackDefaultMs: number
    maxSafeMsPerIter: number
    borderStyle: { top: string; bottom: string }
  }) {
    const { suiteLabel, suffix, iterations, fallbackDefaultMs, maxSafeMsPerIter, borderStyle } = config
    const cacheDir = __dirname
    const HISTORY_LIMIT = 10
    const TOTAL_FILES_LIMIT = 20

    // 1. Вытягиваем текущую версию из package.json
    const pkgPath = path.join(cacheDir, '../../package.json')
    let currentVersion = 'unknown-version'
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg && pkg.version) {
        currentVersion = pkg.version
      }
    } catch (e) {
      console.error('⚠️ [Dashboard Warning] Не удалось прочитать package.json')
    }

    const filePrefix = `.advanced.dynamic-test-cache.${suffix}@`
    const currentCacheFileName = `${filePrefix}${currentVersion}.json`
    const currentCacheFilePath = path.join(cacheDir, currentCacheFileName)

    // 2. Сканируем папку для поиска ВСЕХ файлов кэша этого режима и подсчета общего лимита файлов
    const otherVersionsSummary: Array<{ version: string; msPerIter: number; duration: number }> = []
    const allCacheFilesFound: string[] = []

    try {
      const files = fs.readdirSync(cacheDir)
      for (const file of files) {
        // Подсчитываем вообще любые файлы кэша (express и die-hard всех версий) для лимита
        if (file.startsWith('.advanced.dynamic-test-cache.') && file.endsWith('.json')) {
          allCacheFilesFound.push(file)
        }

        // Собираем историю именно этого режима (suffix) для матрицы
        if (file.startsWith(filePrefix) && file.endsWith('.json')) {
          const safePrefixPattern = filePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
          const matched = file.match(new RegExp(`${safePrefixPattern}(.+?)\\.json$`))
          if (matched) {
            const vName = matched[1]
            try {
              const fileData = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'))
              const historyArray = Array.isArray(fileData) ? fileData : (fileData.history || [])
              if (historyArray.length > 0) {
                // Берем самую последнюю точку рантайма этой версии как срез данных
                const latestEntry = historyArray[historyArray.length - 1]
                otherVersionsSummary.push({
                  version: vName,
                  duration: latestEntry.duration,
                  msPerIter: latestEntry.duration / latestEntry.iterations
                })
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    // 3. Читаем массив запусков ИМЕННО ДЛЯ ТЕКУЩЕЙ ВЕРСИИ
    let currentVersionHistory: Array<{ duration: number; iterations: number; timestamp: number }> = []
    if (fs.existsSync(currentCacheFilePath)) {
      try {
        const fileContent = JSON.parse(fs.readFileSync(currentCacheFilePath, 'utf8'))
        currentVersionHistory = Array.isArray(fileContent) ? fileContent : (fileContent.history || [])
      } catch (e) {}
    }

    // Извлекаем данные предыдущего запуска текущей версии
    let lastDuration = fallbackDefaultMs
    let lastIterations = iterations
    let hasPastLaunchInCurrentVersion = currentVersionHistory.length > 0

    if (hasPastLaunchInCurrentVersion) {
      const lastEntry = currentVersionHistory[currentVersionHistory.length - 1]
      lastDuration = lastEntry.duration
      lastIterations = lastEntry.iterations
    }

    // 4. Запускаем локальный бенчмарк реактивного ядра
    const { duration, effectSpy, checkSum } = runDynamicStressTest(iterations)
    const currentMsPerIter = duration / iterations

    // 5. Расчет дельты относительно прошлого запуска текущей версии
    const lastMsPerIter = lastDuration / lastIterations
    const diffPastLaunchPercent = ((currentMsPerIter - lastMsPerIter) / lastMsPerIter) * 100

    let marker = '🟢'
    let statusText = 'СТАБИЛЬНО'
    let comment = 'Рантайм работает на уровне предыдущего замера текущей версии.'

    if (!hasPastLaunchInCurrentVersion) {
      marker = 'ℹ️'
      statusText = 'ИНИЦИАЛИЗАЦИЯ ВЕРСИИ'
      comment = 'Стартовый слепок для текущей версии успешно сохранен на диск.'
    } else if (diffPastLaunchPercent > 4) {
      marker = '🔴'
      statusText = 'ЗАМЕДЛЕНИЕ'
      comment = 'В коде текущей версии зафиксирован регресс производительности!'
    } else if (diffPastLaunchPercent < -2) {
      marker = '🚀'
      statusText = 'УСКOРЕНИЕ'
      comment = 'Ядро текущей версии успешно оптимизировано относительно прошлого запуска!'
    }

    // 6. Добавляем текущую точку рантайма в локальную историю и ротируем (лимит 10)
    currentVersionHistory.push({
      duration,
      iterations,
      timestamp: Date.now()
    })
    if (currentVersionHistory.length > HISTORY_LIMIT) {
      currentVersionHistory.shift()
    }

    // 7. Строим Sparkline-график и вычисляем тренд строго ВНУТРИ ТЕКУЩЕЙ ВЕРСИИ
    const historicalMsPerIterValues = currentVersionHistory.map(h => h.duration / h.iterations)
    const sparklineGraph = generateSparkline(historicalMsPerIterValues)

    let trendText = 'Историческая тенденция текущей версии стабильна.'
    if (currentVersionHistory.length > 1) {
      const firstEntry = currentVersionHistory[0]
      const firstMsPerIter = firstEntry.duration / firstEntry.iterations
      const totalTrendPercent = ((currentMsPerIter - firstMsPerIter) / firstMsPerIter) * 100

      trendText = totalTrendPercent <= 0
        ? `📉 Динамика версии: Скорость ядра выросла на ${Math.abs(totalTrendPercent).toFixed(1)}% относительно первого (холодного) запуска`
        : ` Northwest: Скорость ядра просела на ${totalTrendPercent.toFixed(1)}% относительно базовой точки. Проверьте кучу!`
    }

    // 8. Матрица межверсионного сравнения по последним доступным точкам
    const matrixLines: string[] = []
    if (otherVersionsSummary.length > 0) {
      for (const remote of otherVersionsSummary) {
        if (remote.version === currentVersion) continue
        const vDiffPercent = ((currentMsPerIter - remote.msPerIter) / remote.msPerIter) * 100
        const vMarker = vDiffPercent <= 0 ? '⚡ Сверхбыстро' : '🐢 Медленнее'
        matrixLines.push( ` • Сводка по версии [${remote.version}]: ${vDiffPercent > 0 ? '+' : ''}${vDiffPercent.toFixed(1)}% (${vMarker})`)
      }
    }
    // 9. Математический вердикт релиза
    let releaseVerdict = ''
    if (currentMsPerIter <= maxSafeMsPerIter) {
      releaseVerdict = `✅ ПОДХОДИТ ДЛЯ РЕЛИЗА! Эффективность ядра (${(currentMsPerIter * 1000).toFixed(2)} μs/iter) преодолела критический порог.`
    } else {
      const targetTotal = maxSafeMsPerIter * iterations
      const diffMs = duration - targetTotal
      releaseVerdict = `❌ НЕ ПОДХОДИТ ДЛЯ БЕНЧМАРКА. Время составляет ${duration.toFixed(2)}ms. Нужно ускорить ядро еще на ${diffMs.toFixed(2)}ms (целевой порог: ${targetTotal.toFixed(2)}ms).`
    }
    // 10. Форматированный вывод Dashboard в терминал
    console.log(borderStyle.top)
    console.log(`💻 [PERFORMANCE DASHBOARD] Сьют: ${suiteLabel} (Версия: ${currentVersion})`)
    console.log(`⏱️  Текущее время (${iterations} ит.): ${duration.toFixed(2)}ms`)
    if (hasPastLaunchInCurrentVersion) {
      console.log(`📊 Предыдущий замер этой версии: ${lastDuration.toFixed(2)}ms`)
      console.log(`${marker} Статус относительно прошлого запуска: [${statusText}] (${diffPastLaunchPercent > 0 ? '+' : ''}${diffPastLaunchPercent.toFixed(1)}%)`)
    } else {
      console.log(`${marker} Статус относительно прошлого запуска: [${statusText}]`)
    }
    console.log(`💬 Комментарий: ${comment}`)
    console.log('----------------------------------------------------------------------')
    console.log(`📊 ТЕНДЕНЦИЯ ВЕРСИИ ${currentVersion} (Последние ${currentVersionHistory.length} запусков):`)
    console.log(`   [Меньше — лучше]  ${sparklineGraph}`)
    console.log(`   💬 ${trendText}`)
    if (matrixLines.length > 0) {
      console.log('----------------------------------------------------------------------')
      console.log(`📈 СРАВНИТЕЛЬНАЯ МАТРИЦА ПО СВОДКАМ ДРУГИХ ВЕРСИЙ:`)
      for (const line of matrixLines) {
        console.log(line)
      }
    }
    console.log('----------------------------------------------------------------------')
    console.log(`📢 ВЕРДИКТ ДЛЯ РЕЛИЗА В БЕНЧМАРК:`)
    console.log(`${releaseVerdict}`)
    // 🛑 БЛОК КОНТРОЛЯ ИЗБЫТОЧНЫХ ФАЙЛОВ КЭША (> 20 файлов)
    if (allCacheFilesFound.length > TOTAL_FILES_LIMIT) {
      console.log('----------------------------------------------------------------------')
      console.log(`🛑 ПРЕДУПРЕЖДЕНИЕ: Обнаружен избыток файлов кэша (${allCacheFilesFound.length} из ${TOTAL_FILES_LIMIT} допустимых)!`)
      console.log('   Пожалуйста, удалите устаревшие файлы версий вручную, чтобы очистить git-дерево:')
      console.log('\n   reactive-engine/')
      console.log('   └── src/')
      console.log('       └── core/')
      for (const cacheFile of allCacheFilesFound) {
        const isCurrent = cacheFile === currentCacheFileName || cacheFile === currentCacheFileName.replace(suffix, suffix === 'express' ? 'die-hard' : 'express')
        console.log(`           ├── ${cacheFile} ${isCurrent ? '👈 [ОСТАВИТЬ]' : '❌ [РЕНДЕР К УДАЛЕНИЮ]'}`)
      }
      console.log('')
    }
    console.log(borderStyle.bottom)
    // 11. Сохраняем обновленный изолированный JSON массив истории версии на диск
    try {
      fs.writeFileSync(currentCacheFilePath, JSON.stringify({ history: currentVersionHistory }, null, 2), 'utf8')
    } catch (e) {}
    expect(effectSpy).toHaveBeenCalled()
    expect(checkSum).toBeGreaterThan(0)
  }
  test(' Amphibia: 🟢 Экспресс-анализ динамического графа (Быстрый чек перед релизом)', () => {
    evaluateAndReportPerformance({
      suiteLabel: 'Dynamic Graphs (Экспресс-чек)',
      suffix: 'express',
      iterations: 1000,
      fallbackDefaultMs: 1462.79,
      maxSafeMsPerIter: 0.6,
      borderStyle: {
        top: '\n➕ [ START: EXPRESS CHECK ] ➕',
        bottom: '➕ [ END: EXPRESS CHECK ] ➕\n'
      }
    })
  })
  test.skip(' DieHard: 💀 Полная спецификация Dynamic Graphs (Полный боевой объем из бенчмарка)', () => {
    evaluateAndReportPerformance({
      suiteLabel: 'Dynamic Graphs (Die-Hard Полный Объем)',
      suffix: 'die-hard',
      iterations: 15000,
      fallbackDefaultMs: 21941.85,
      maxSafeMsPerIter: 0.6,
      borderStyle: {
        top: '\n⚠️ [ START: DIE-HARD WORKLOAD ] ⚠️',
        bottom: '⚠️ [ END: DIE-HARD WORKLOAD ] ⚠️\n'
      }
    })
  })
})
