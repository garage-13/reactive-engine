// src/examples/example-117/service.Example117.ts
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

// 1. Инициализируем два абсолютно независимых инстанса реактивного ядра из ветки /react
export const hostEngine = new ReactiveEngine({
  logger: { isEnabled: true, traceTime: false, filter: /^host:.*/ }
})

export const widgetEngine = new ReactiveEngine({
  logger: { isEnabled: true, traceTime: false, filter: /^widget:.*/ }
})

// 2. Описываем Глобальный сервис хост-приложения (Engine 1)
export class HostGlobalService extends AbstractService {
  public activeUserId = this.engine.signal<string>('user-1', 'host:active-user-id')

  public switchUser(id: string) {
    this.activeUserId.value = id
  }
}

// 3. Описываем Внутренний сервис изолированного виджета (Engine 2)
export class WidgetInternalService extends AbstractService {
  public currentTargetUser = this.engine.signal<string>('', 'widget:target-user')
  public widgetLocalCounter = this.engine.signal<number>(0, 'widget:local-counter')

  // Вычисляемое свойство виджета
  public widgetStatus = this.engine.computed(() => {
    return `[Виджет v117 для ${this.currentTargetUser.value}]. Локальных кликов: ${this.widgetLocalCounter.value}`
  }, 'widget:computed:status [IS_OPTIMIZED=1]')

  public incLocal() {
    this.widgetLocalCounter.value += 1
  }
}

// 4. Регистрируем синглтоны в их родных контейнерах через inject
export const hostLogic = hostEngine.inject(HostGlobalService)
export const widgetLogic = widgetEngine.inject(WidgetInternalService)

// 🌟 ЧИСТЫЙ JS-МОСТ СИНХРОНИЗАЦИИ (Способ 1):
// Мы подписываемся напрямую на мутации сигнала Первого движка (Engine 1).
// Метод .subscribe() возвращает событие изменений. Эта связь вечна и изолирована
// в слое данных, обходя планировщик фоновых эффектов и рендеринг React!
// hostLogic.activeUserId.subscribe((event) => {
//   // Напрямую и синхронно пушим новое значение во Второй изолированный движок (Engine 2)
//   widgetLogic.currentTargetUser.value = event.to
// })
// 🌟 ИСПРАВЛЕННЫЙ И ТИПOБЕЗОПАСНЫЙ JS-МОСТ (Способ 1):
// Метод .subscribe() у сигналов вашего ядра поставляет напрямую новое значение (строку).
hostLogic.activeUserId.subscribe((nextUserId) => {
  // Напрямую и синхронно пушем новое строковое значение во Второй движок
  widgetLogic.currentTargetUser.value = nextUserId
})
