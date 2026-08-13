import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

// 1. Инициализируем два абсолютно независимых инстанса реактивного ядра
export const hostEngine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: false,
    filter: /^host:.*/,
    instanceName: 'example-116 (host)',
  }
})

export const widgetEngine = new ReactiveEngine({
  logger: {
    isEnabled: true,
    traceTime: false,
    filter: /^widget:.*/,
    instanceName: 'example-116 (widget)',
  }
})

// 2. Описываем Глобальный сервис хост-приложения (Инстанс 1)
export class HostGlobalService extends AbstractService {
  public activeUserId = this.engine.signal<string>('user-1', 'host:active-user-id')

  public switchUser(id: string) {
    this.activeUserId.value = id
  }
}

// 3. Описываем Внутренний сервис изолированного виджета (Инстанс 2)
export class WidgetInternalService extends AbstractService {
  public currentTargetUser = this.engine.signal<string>('', 'widget:target-user')
  public widgetLocalCounter = this.engine.signal<number>(0, 'widget:local-counter')

  // Вычисляемое свойство виджета
  public widgetStatus = this.engine.computed(() => {
    return `[Виджет для ${this.currentTargetUser.value}]. Локальных кликов: ${this.widgetLocalCounter.value}`
  }, 'widget:computed:status')

  public incLocal() {
    this.widgetLocalCounter.value += 1
  }
}

// 4. Регистрируем синглтоны в их родных контейнерах через inject
export const hostLogic = hostEngine.inject(HostGlobalService)
export const widgetLogic = widgetEngine.inject(WidgetInternalService)

// СТАТИЧЕСКИЙ КРОСС-ДВИЖКОВЫЙ МОСТ (Способ 2):
// Создаем декларативный эффект на уровне hostEngine. Он вечно живет в слое данных.
// Как только сигнал хоста изменится — ядро упакует этот тик в транзакцию хоста,
// синхронно разбудит коллбэк, и мы запушим значение во второй движок widgetEngine!
hostEngine.effect(() => {
  const freshHostUserId = hostLogic.activeUserId.value // Намертво подписываемся к Engine 1

  // Синхронно передаем значение во Второй изолированный движок (Engine 2)
  widgetLogic.currentTargetUser.value = freshHostUserId
}, 'host:bridge-effect:global-host-to-widget-sync')
