import { describe, test, expect, vi } from 'vitest'
import { ReactiveEngineCore } from './core'
import path from 'path'
import fs from 'fs'

interface HistoryEntry {
  duration: number
  iterations: number
  timestamp: number
  nodeBytes?: number
  tickAllocBytes?: number
  leakBytes?: number
}

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

    // ⚡ ВЫНОС ИЗ ЦИКЛА: Строим топологию графа один раз до начала итераций мутаций
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

    let checkSum = 0
    const effectSpy = vi.fn()

    // Инициализируем генератор для мутаций детерминированно
    const rngMutation = createRandom(1337)

    // Начинаем замер времени: теперь замеряются только ЧИСТЫЕ вычисления графа
    const startTime = performance.now()

    for (let iter = 0; iter < iterations; iter++) {
      engine.batch(() => {
        const randomSourceIndex = Math.floor(rngMutation() * nSources)
        sources[randomSourceIndex].value = iter + randomSourceIndex

        for (let i = 0; i < currentLayer.length; i++) {
          effectSpy()

          if (rngMutation() < readFraction) {
          // Чтение значения узла computed. Наше оптимизированное
          // ядро выполнит ленивый апдейт за O(1)
            checkSum += currentLayer[i].value
          }
        }
      })
    }

    const duration = performance.now() - startTime
    return { duration, effectSpy, checkSum }
  }

  function forceGc() {
    if (typeof (globalThis as any).gc === 'function') {
      ;(globalThis as any).gc()
      ;(globalThis as any).gc()
    }
  }

  function runMemoryProbe() {
    const hasGc = typeof (globalThis as any).gc === 'function'

    // 1. Вес 1 узла (Node B) на графе из 4 000 узлов (1 000 цепочек × 4)
    const CHAINS = 1000
    const NODES = CHAINS * 4
    const warmEngine = new ReactiveEngineCore()
    const warmKeep: any[] = []
    for (let i = 0; i < 100; i++) {
      const s = warmEngine.signal(i)
      const c1 = warmEngine.computed(() => s.value + 1)
      const c2 = warmEngine.computed(() => c1.value * 2)
      warmKeep.push(s, c1, c2, warmEngine.effect(() => void c2.value))
    }
    warmKeep.length = 0

    forceGc()
    const heapBeforeGraph = process.memoryUsage().heapUsed
    const graphEngine = new ReactiveEngineCore()
    const keep: any[] = [graphEngine]
    let sink = 0
    for (let i = 0; i < CHAINS; i++) {
      const s = graphEngine.signal(i)
      const c1 = graphEngine.computed(() => s.value + 1)
      const c2 = graphEngine.computed(() => c1.value * 2)
      const stop = graphEngine.effect(() => {
        sink += c2.value
      })
      keep.push(s, c1, c2, stop)
    }
    forceGc()
    const heapAfterGraph = process.memoryUsage().heapUsed
    const nodeBytes = Number((Math.max(0, heapAfterGraph - heapBeforeGraph) / NODES).toFixed(1))
    keep.length = 0
    forceGc()

    // 2. Временные аллокации за 1 батч-тик (Tick Alloc B) на 2 000 итерациях
    const tickEngine = new ReactiveEngineCore()
    const a = tickEngine.signal(0)
    const b = tickEngine.signal(0)
    const c1 = tickEngine.computed(() => a.value + b.value)
    const c2 = tickEngine.computed(() => c1.value * 2)
    const c3 = tickEngine.computed(() => c2.value + a.value)
    const c4 = tickEngine.computed(() => c3.value - b.value)
    const c5 = tickEngine.computed(() => c1.value + c4.value)
    const stopTick = tickEngine.effect(() => {
      sink = c5.value
    })
    for (let i = 0; i < 300; i++) {
      tickEngine.batch(() => {
        a.value = i + 2
        b.value = i + 3
      })
    }

    const TICK_ITERS = 2000
    forceGc()
    const heapBeforeTick = process.memoryUsage().heapUsed
    for (let i = 0; i < TICK_ITERS; i++) {
      tickEngine.batch(() => {
        a.value = i + 2
        b.value = i + 3
      })
    }
    const heapAfterTick = process.memoryUsage().heapUsed
    const tickAllocBytes = Number((Math.max(0, heapAfterTick - heapBeforeTick) / TICK_ITERS).toFixed(1))
    stopTick()
    forceGc()

    // 3. Остаток при динамическом Mount / Dispose (Leak B/cycle) на 1 000 циклах
    const mountEngine = new ReactiveEngineCore()
    const rootA = mountEngine.signal(1)
    const rootB = mountEngine.signal(2)
    const MOUNT_CYCLES = 1000
    forceGc()
    const heapBeforeMount = process.memoryUsage().heapUsed
    for (let i = 0; i < MOUNT_CYCLES; i++) {
      const c = mountEngine.computed(() => rootA.value + rootB.value + i)
      const stop = mountEngine.effect(() => {
        sink += c.value
      })
      rootA.value = i
      stop()
    }
    forceGc()
    const heapAfterMount = process.memoryUsage().heapUsed
    const leakBytes = Number((Math.max(0, heapAfterMount - heapBeforeMount) / MOUNT_CYCLES).toFixed(2))

    expect(sink).toBeGreaterThanOrEqual(0)
    return { hasGc, nodeBytes, tickAllocBytes, leakBytes }
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

  // Universal smart rendering engine for Performance Dashboard
  function evaluateAndReportPerformance(config: {
    suiteLabel: string
    suffix: string
    iterations: number
    fallbackDefaultMs: number
    maxSafeMsPerIter: number
    borderStyle: { top: string; bottom: string }
  }) {
    const { suiteLabel, suffix, iterations, fallbackDefaultMs, maxSafeMsPerIter, borderStyle } = config
    const currentFileDir = __dirname
    const HISTORY_LIMIT = 10
    const TOTAL_FILES_LIMIT = 20

    // ⚛️ РЕФАКТОРИНГ: Создание выделенной папки для кэша результатов
    const cacheDir = path.join(currentFileDir, '.dynamic-test-cache')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    // 1. Вытягиваем текущую версию из package.json
    const pkgPath = path.join(currentFileDir, '../../package.json')
    let currentVersion = 'unknown-version'
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg && pkg.version) {
        currentVersion = pkg.version
      }
    } catch (e) {
      console.error('⚠️ [Dashboard Warning] Не удалось прочитать package.json')
    }

    // ⚛️ РЕФАКТОРИНГ: Новый чистый формат нейминга файлов версий (например, 2.6.3-express.json)
    const currentCacheFileName = `${currentVersion}-${suffix}.json`
    const currentCacheFilePath = path.join(cacheDir, currentCacheFileName)

    // 2. Сканируем выделенную папку для поиска ВСЕХ файлов кэша этого режима и подсчета общего лимита файлов
    // 2. Сканируем выделенную папку для поиска ВСЕХ файлов кэша этого режима
    const otherVersionsSummary: Array<{
      version: string
      msPerIter: number
      duration: number
      nodeBytes?: number
      tickAllocBytes?: number
      leakBytes?: number
    }> = []
    const allCacheFilesFound: string[] = []

    try {
      const files = fs.readdirSync(cacheDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          allCacheFilesFound.push(file)
        }

        if (file.endsWith(`-${suffix}.json`)) {
          const matched = file.match(new RegExp(`^(.+?)-${suffix}\\.json$`))
          if (matched) {
            const vName = matched[1]
            try {
              const fileData = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'))
              const historyArray: HistoryEntry[] = Array.isArray(fileData)
                ? fileData
                : fileData.history || []
              if (historyArray.length > 0) {
                const latestEntry = historyArray[historyArray.length - 1]
                otherVersionsSummary.push({
                  version: vName,
                  duration: latestEntry.duration,
                  msPerIter: latestEntry.duration / latestEntry.iterations,
                  nodeBytes: latestEntry.nodeBytes,
                  tickAllocBytes: latestEntry.tickAllocBytes,
                  leakBytes: latestEntry.leakBytes,
                })
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    // 3. Читаем массив запусков ИМЕННО ДЛЯ ТЕКУЩЕЙ ВЕРСИИ
    let currentVersionHistory: HistoryEntry[] = []
    if (fs.existsSync(currentCacheFilePath)) {
      try {
        const fileContent = JSON.parse(fs.readFileSync(currentCacheFilePath, 'utf8'))
        currentVersionHistory = Array.isArray(fileContent)
          ? fileContent
          : fileContent.history || []
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

    // 4. Запускаем локальный бенчмарк реактивного ядра (скорость + память)
    const { duration, effectSpy, checkSum } = runDynamicStressTest(iterations)
    const mem = runMemoryProbe()
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
    const newEntry: HistoryEntry = {
      duration,
      iterations,
      timestamp: Date.now(),
    }
    if (mem.hasGc) {
      newEntry.nodeBytes = mem.nodeBytes
      newEntry.tickAllocBytes = mem.tickAllocBytes
      newEntry.leakBytes = mem.leakBytes
    }
    currentVersionHistory.push(newEntry)
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

        let memDiffPart = ''
        if (mem.hasGc && remote.nodeBytes !== undefined) {
          const nodeDelta = (mem.nodeBytes - remote.nodeBytes).toFixed(1)
          const tickDelta = (mem.tickAllocBytes - (remote.tickAllocBytes ?? 0)).toFixed(1)
          const leakDelta = (mem.leakBytes - (remote.leakBytes ?? 0)).toFixed(2)
          memDiffPart =
            `\n    ↳ Память: Node ${mem.nodeBytes}B (${Number(nodeDelta) <= 0 ? '' : '+'}${nodeDelta}B vs ${remote.nodeBytes}B)` +
            ` | Tick ${mem.tickAllocBytes}B (${Number(tickDelta) <= 0 ? '' : '+'}${tickDelta}B vs ${remote.tickAllocBytes}B)` +
            ` | Leak ${mem.leakBytes}B (${Number(leakDelta) <= 0 ? '' : '+'}${leakDelta}B vs ${remote.leakBytes}B)`
        }

        matrixLines.push(
          `  • Сводка по версии [${remote.version}]: время ${vDiffPercent > 0 ? '+' : ''}${vDiffPercent.toFixed(1)}% (${vMarker})${memDiffPart}`
        )
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
    if (mem.hasGc) {
      console.log(
        `🧠 Память V8 (--expose-gc): Node: ${mem.nodeBytes} B | Tick Alloc: ${mem.tickAllocBytes} B | Leak: ${mem.leakBytes} B/cycle`
      )
    } else {
      console.log(`⚠️  Память V8: запустите с NODE_OPTIONS="--expose-gc" для замера Node/Tick/Leak`)
    }

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
    console.log('📢 ВЕРДИКТ ДЛЯ РЕЛИЗА В БЕНЧМАРК:')
    console.log(releaseVerdict)
    // 🛑 БЛОК КОНТРОЛЯ ИЗБЫТОЧНЫХ ФАЙЛОВ КЭША (> 20 файлов)
    if (allCacheFilesFound.length > TOTAL_FILES_LIMIT) {
      console.log('----------------------------------------------------------------------')
      console.log(`🛑 ПРЕДУПРЕЖДЕНИЕ: Обнаружен избыток файлов кэша (${allCacheFilesFound.length} из ${TOTAL_FILES_LIMIT} допустимых)!`)
      console.log('   Пожалуйста, удалите устаревшие файлы версий вручную, чтобы очистить git-дерево:')
      console.log('\n   reactive-engine/')
      console.log('   └── src/')
      console.log('       └── core/')
      console.log('           └── .dynamic-test-cache/')
      for (const cacheFile of allCacheFilesFound) {
        const isCurrent = cacheFile === currentCacheFileName || cacheFile === currentCacheFileName.replace(suffix, suffix === 'express' ? 'die-hard' : 'express')
        console.log(`               ├── ${cacheFile} ${isCurrent ? '👈 [ОСТАВИТЬ]' : '❌ [РЕНДЕР К УДАЛЕНИЮ]'}`)
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
      fallbackDefaultMs: 3824.75, // Наш новый эталонный базовый уровень после оптимизации
      maxSafeMsPerIter: 4.5,      // Порог 4.5ms/iter (целевой лимит 4500ms)
      borderStyle: {
        top: '\n➕ [ START: EXPRESS CHECK ] ➕',
        bottom: '➕ [ END: EXPRESS CHECK ] ➕\n'
      }
    })
  })
  test(' DieHard: 💀 Полная спецификация Dynamic Graphs (Полный боевой объем из бенчмарка)', () => {
    evaluateAndReportPerformance({
      suiteLabel: 'Dynamic Graphs (Die-Hard Полный Объем)',
      suffix: 'die-hard',
      iterations: 15000,
      fallbackDefaultMs: 64752.74, // Наш новый эталонный базовый уровень
      maxSafeMsPerIter: 4.5,       // Порог 4.5ms/iter (целевой лимит 67500ms)
      borderStyle: {
        top: '\n⚠️ [ START: DIE-HARD WORKLOAD ] ⚠️',
        bottom: '⚠️ [ END: DIE-HARD WORKLOAD ] ⚠️\n'
      }
    })
  }, 80000) // 👈 Выставляем таймаут Vitest в 80 секунд, чтобы дать тесту гарантированно завершиться
})
