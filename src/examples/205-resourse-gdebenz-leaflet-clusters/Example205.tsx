import { useEffect, useRef } from 'react'
import baseClasses from '../ui.common.module.scss'
import { ReactiveEngine } from '../../core'
import { MapLogic } from './service.MapLogic'
import clsx from 'clsx'
import { useReactiveValue } from '../../hooks'

const engine = new ReactiveEngine()

export const MapExample = () => {
  // Инжектируем сервис логики, который управляет Leaflet и реактивным состоянием
  const logic = engine.inject(MapLogic)

  // Достаем состояние ресурса АЗС для декларативного отображения статуса в UI
  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)

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
            ? '🟡 Получение АЗС...'
            : stations
              ? `🟢 Найдено АЗС: ${stations.length}`
              : error
                ? '🔴 Ошибка запроса'
                : '⚪'}
        </span>
        {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
      </div>
    </div>
  )
}
