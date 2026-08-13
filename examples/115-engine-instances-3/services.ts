import { AbstractService } from '@pravosleva/reactive-engine'

// Глобальный сервис хост-приложения (Инстанс 1)
export class HostGlobalService extends AbstractService {
  public activeUserId = this.engine.signal<string>('user-1', 'host:active-user-id')

  public switchUser(id: string) {
    this.activeUserId.value = id
  }
}

// Внутренний сервис изолированного виджета (Инстанс 2)
export class WidgetInternalService extends AbstractService {
  // Виджет хранит локальную копию ID, чтобы крутить вокруг неё свои вычисления
  public currentTargetUser = this.engine.signal<string>('', 'widget:target-user')
  public widgetLocalCounter = this.engine.signal<number>(0, 'widget:local-counter')

  // Тяжелый локальный компутед виджета
  public widgetStatus = this.engine.computed(() => {
    return `[Виджет работает для ${this.currentTargetUser.value}]. Локальных кликов: ${this.widgetLocalCounter.value}`
  }, 'widget:computed:status')

  public incLocal() {
    this.widgetLocalCounter.value += 1
  }
}
