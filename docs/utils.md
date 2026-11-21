# Утилиты

## Кастомная функция сравнения (`equals`), `shallowEqual` и `deepEqual`

По умолчанию `computed` сравнивает предыдущее и новое значение через быстрый `Object.is(prev, next)`, а `signal` пропускает перезапись только для одинаковых примитивов (чтобы мутации по одной объектной ссылке могли инициировать обновление).

Если вычисление или сеттер возвращает новый массив или объект с идентичным содержимым (например, после `.map()` или `.filter()`), передайте опцию **`equals`** — вручную или используя встроенные утилиты **`shallowEqual`** и **`deepEqual`**:

```typescript
import { ReactiveEngine, shallowEqual, deepEqual } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// 1. Поверхностное сравнение плоского объекта в signal()
const coords = engine.signal({ x: 10, y: 20 }, { name: 'ui:coords', equals: shallowEqual })

// 2. Глубокое сравнение вложенных массивов/DTO в computed()
const rawList = engine.signal([1, 2, 3], 'data:raw')
const mappedList = engine.computed(
  () => rawList.value.map((n) => ({ id: n, even: n % 2 === 0 })),
  { name: 'data:mapped', equals: deepEqual }
)
```
