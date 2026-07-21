import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MapLogic } from './service.MapLogic'
import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'
import { ReactiveEngine } from '../../core'
import { useReactiveValue } from '../../hooks'
import { Input } from '../shared/Input'
import { Select } from '../shared/Select'
// import './fix-googlemaps-exp.css'

const engine = new ReactiveEngine()

export const MapExample = () => {
  /**
   * Инжектированный инстанс бизнес-сервиса управления картой.
   *
   * Через механизм Dependency Injection (DI) движка `ReactiveEngine` компонент получает
   * единый синглтон-сервис `MapLogic`. Этот сервис инкапсулирует в себе всю императивную
   * работу с Google Maps API v3, управление сетевым ресурсом АЗС и синхронизацию
   * географических координат.
   *
   * Использование `engine.inject` гарантирует изолированность бизнес-логики от жизненного
   * цикла React и позволяет тестировать картографию независимо от слоя представления (UI).
   *
   * @type {MapLogic}
   */
  const logic: MapLogic = engine.inject(MapLogic)

  /**
   * Реактивное состояние асинхронного ресурса получения списка АЗС.
   *
   * Хук `useReactiveValue` подписывает React-компонент на изменения состояния `stationsResource`.
   * При каждом обновлении географических границ карты (`bbox`) движок автоматически выполняет
   * fetch-запрос, переводя этот объект в соответствующий статус.
   *
   * Деструктуризация возвращает четыре реактивных свойства:
   * - `loading` {boolean}: Флаг текущего выполнения сетевого запроса к API.
   * - `data` {Station[] | null}: Массив успешно полученных объектов АЗС для текущего bbox.
   * - `error` {Error | null}: Объект ошибки, если сетевой запрос или pre-валидация завершились сбоем.
   * - `isRetrying` {boolean}: Флаг, указывающий на выполнение повторных попыток при экспоненциальном бэк-оффе.
   */
  const { loading, data: stations, error } = useReactiveValue(logic.stationsResource)

  /**
   * Текущая выбранная пользователем автозаправочная станция (АЗС).
   *
   * Хук `engine.use` осуществляет прямую атомарную подписку React-компонента на сигнал `selectedStation`.
   * Компонент будет автоматически перерендерен только тогда, когда изменится значение именно этого сигнала
   * (например, при клике на кнопку «Выбрать АЗС» внутри балуна карты или при сбросе выбора).
   *
   * Используется для декларативного отображения карточки активной заправки под картой.
   *
   * @type {Station | null}
   */
  const selectedStation = engine.use(logic.selectedStation)

  /**
   * Идентификатор текущего активного города для выпадающего списка (селекта).
   *
   * Хук `engine.use` связывает реактивный сигнал `currentCityId` со значением (`value`) HTML-селекта.
   * Обеспечивает синхронизацию интерфейса: при выборе города в выпадающем списке экшен `setCity`
   * меняет сигнал, что приводит к автоматическому обновлению значения в селекте и перелёту камеры.
   *
   * @type {string}
   */
  const currentCityId = engine.use(logic.currentCityId)

  // Читаем реактивное состояние прямо из инжектированного загрузчика Google Maps
  const isKeyMissing = engine.use(logic.loader.isKeyMissing)
  const loadError = engine.use(logic.loader.loadError)

  const [inputKey, setInputKey] = useState('')
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mapRef.current) {
      logic.initializeMap(mapRef.current)
    }
    return () => {
      logic.destroyMap()
    }
  }, [logic, isKeyMissing])

  return (
    <div
      className={clsx(baseClasses.unit, baseClasses.stack2)}
      style={{ fontFamily: 'system-ui' }}
    >
      <div className={baseClasses.absoluteUnitLabel}>
        Google Maps API (Dynamic Loader + Clusters + Reactive state)
      </div>

      {isKeyMissing ? (
        <div style={{ padding: '24px', background: '#222227', borderRadius: '8px', textAlign: 'center', width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)' }}>
          <h3 style={{ color: '#1a73e8', margin: '0 0 8px 0' }}>
            Работа с Google Maps невозможна
          </h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 16px 0' }}>
            Для отрисовки карты требуется обязательный API-ключ Google Maps JavaScript API.<br />
            Пожалуйста, введите его ниже:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <Input
              type="text"
              placeholder="Вставьте Google API_KEY"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
            />
            <button
              onClick={() => logic.loader.submitApiKey(inputKey)}
              className={clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
            >
              Активировать
            </button>
          </div>
        </div>
      ) : (
        <>
          {
            !loadError && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="city-select">Выберите город:</label>
                <Select
                  id="city-select"
                  // label="Выберите город"
                  value={currentCityId}
                  onChange={(e) => logic.setCity(e.target.value)}
                  variant="outlined"       // или "contained"
                  colorType="primary"      // или "secondary"
                >
                  {/* Если нужен пустой первый пункт (unselected state) как в MUI: */}
                  {/* <option value="" disabled hidden></option> */}

                  {logic.cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </Select>
              </div>
            )
          }

          {loadError ? (
            <div
              style={{ width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)', padding: '16px', background: '#1a1a1f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef5350', borderRadius: '8px', flexDirection: 'column', gap: '12px' }}
            >
              <span style={{ textAlign: 'center' }}>❌ {loadError}</span>
              <button onClick={() => logic.loader.reset()} style={{ background: 'transparent', color: '#2196f3', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Ввести другой ключ
              </button>
            </div>
          ) : (
            <div
              ref={mapRef}
              style={{ width: 'calc(100vw - 24px - 24px - 24px - 24px - 16px - 16px - 4px - 4px)', height: '400px', borderRadius: '8px', zIndex: 1 }}
            />
          )}
        </>
      )}

      {!isKeyMissing && !loadError && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>
            {loading ? '🟡 Получение АЗС...' : stations ? `🟢 Найдено АЗС: ${stations.length}` : error ? '🔴 Ошибка запроса' : '⚪'}
          </span>
          {error?.message && <em style={{ color: 'red' }}>{error.message}</em>}
        </div>
      )}

      {selectedStation && (
        <button
          onClick={() => logic.focusOnStation(selectedStation, true)}
          style={{
            padding: '16px',
            border: '1px solid lightgray',
            borderRadius: '8px',
            textAlign: 'left',
          }}>
          <strong style={{ color: '#4caf50' }}>Реактивный выбор:</strong>
          <br />
          {selectedStation.title || selectedStation.name} (ID: {selectedStation.id})
        </button>
      )}
    </div>
  )
}
