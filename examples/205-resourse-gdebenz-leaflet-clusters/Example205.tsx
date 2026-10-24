import { useEffect, useRef } from 'react'
import baseClasses from '~/ui.common.module.scss'
import { ReactiveEngine, useReactiveValue } from '@pravosleva/reactive-engine/react'
import { MapLogic } from './service.MapLogic'
import clsx from 'clsx'

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true, // Включаем логгер
    traceTime: true, // Добавляем вывод таймингов по желанию
    filter: /^(example-|map:)/, // Можно фильтровать только нужные логи
    isCoreOptimizationDebugEnabled: false,
  }
})

export const MapExample = () => {
  // Инжектируем сервис логики, который управляет Leaflet и реактивным состоянием
  const logic = engine.inject(MapLogic)

  // Достаем состояние ресурса АЗС для декларативного отображения статуса в UI
  const { loading, error, isRetrying, attemptIndex, retryCount, totalElapsedMs } = useReactiveValue(logic.stationsResource)

  const markersCount = engine.use(logic.validMarkersData).length// По аналогии с Example100

  /**
   * Callback Ref для управления жизненным циклом DOM-ноды карты.
   * Вызывается автоматически React'ом при монтировании и размонтировании.
   */
  const mapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mapRef.current) {
      logic.initializeMap(mapRef.current)
    }

    // Передаем стрелочную функцию, чтобы избежать проблем с контекстом
    return () => {
      logic.destroyMap()
    }
  }, [logic])
  /* NOTE:
  1. Безопасный запуск эффекта: Перенос this.engine.effect из onInit в метод initializeMap гарантирует,
  что this.stationsResource уже объявлен и определен на момент старта подписки.
  2. Защита контекста this: Методы initializeMap и destroyMap
  объявлены как стрелочные функции (= () => {}).
  Теперь, как бы React ни вызывал эти методы в хуках очистки,
  контекст класса MapLogic никогда не потеряется.
  3. Жизненный цикл эффекта: При вызове destroyMap функция очистки эффекта this.effectCleanup()
  вызывается принудительно, вычищая подписку из ядра ReactiveEngine во избежание утечек памяти.
  */

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>
        Map Stations (BBox API + Debounce + Clusters)
      </div>

      {/* Контейнер для карты Leaflet */}
      <div
        ref={mapRef}
        style={{
          width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)',
          height: '400px',
          borderRadius: '8px',
          zIndex: 1,
        }}
      />

      {/* Декларативный вывод статуса загрузки */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>
          {loading
            ? isRetrying
              ? `🔄 Восстановление сети (попытка ${attemptIndex} из ${retryCount})...`
              : '🟡 Получение АЗС...'
            : !error
              ? `🟢 Найдено АЗС: ${markersCount}`
              : '🔴 Ошибка запроса'}
        </span>
      </div>
      {error && <em style={{ color: 'red' }}>{error}</em>}
      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <em style={{ color: 'red', fontSize: '13px' }}>{error}</em>
          {totalElapsedMs !== undefined && (
            <span style={{ color: '#888', fontSize: '11px' }}>
                ⏱️ Общее время ожидания графа: {(totalElapsedMs / 1000).toFixed(2)} сек.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
