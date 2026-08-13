import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

// 1. Инициализируем два абсолютно независимых инстанса реактивного ядра из ветки /react
export const hostEngine = new ReactiveEngine({
  logger: {
    isEnabled: false,
    traceTime: false,
    filter: /^host:.*/,
    instanceName: 'example-117 (host)',
  }
})

export const widgetEngine = new ReactiveEngine({
  logger: {
    isEnabled: false,
    traceTime: false,
    filter: /^widget:.*/,
    instanceName: 'example-117 (widget)',
  }
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
  }, 'widget:computed:status')

  public incLocal() {
    this.widgetLocalCounter.value += 1
  }
}

// 4. Регистрируем синглтоны в их родных контейнерах через inject
export const hostLogic = hostEngine.inject(HostGlobalService)
export const widgetLogic = widgetEngine.inject(WidgetInternalService)

// ЧИСТЫЙ JS-МОСТ СИНХРОНИЗАЦИИ (Способ 1):
// Мы подписываемся напрямую на мутации сигнала Первого движка (Engine 1).
// Метод .subscribe() у сигналов ядра поставляет напрямую новое значение (строку).
hostLogic.activeUserId.subscribe((nextUserId) => {
  // Напрямую и синхронно пушем новое строковое значение во Второй движок
  widgetLogic.currentTargetUser.value = nextUserId
})
