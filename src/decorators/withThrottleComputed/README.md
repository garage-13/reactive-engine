# `withThrottleComputed` (для синхронных вычислений)

Применяется **на входе в реактивный граф для изоляции сырого спама данных**.

* **Когда использовать:** Когда входной сигнал генерирует сотни событий в секунду (координаты мыши, пиксели скролла), и вам нужно «сжать» этот поток до дозированных тиков (например, раз в 300 мс) перед тем, как пустить его дальше в другие сервисы, computed-свойства или тяжелые UI-компоненты.
* **Как это работает:** Он перехватывает чтение сырого сигнала, подписывается на него, но обновляет результирующий стейт строго по таймеру, отсекая промежуточный дребезг.

```typescript
import { AbstractService, withThrottleComputed } from '@pravosleva/reactive-engine'

export class Throttle2DLogic extends AbstractService {
  // ...

  // Пример: Троттлинг мышиного трекинга перед расчетом тяжелой гео-модели
  public rawCoords = this.engine.signal({ x: 0, y: 0 }, 'signal:raw-coords')

  // Зажимаем спам координат на этапе вычислений
  public throttledCoords = withThrottleComputed(
    this.engine,
    () => this.rawCoords.value,
    { limit: 300 },
    'computed:throttled-coords'
  )
}
```
