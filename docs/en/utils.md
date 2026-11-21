# Utils

## Custom Equality Comparator (`equals`), `shallowEqual`, and `deepEqual`

By default, `computed` compares previous and next values via fast `Object.is(prev, next)`, while `signal` skips updates only for identical primitives (allowing same-reference object updates to propagate).

When a computation or signal setter produces a freshly allocated array or object with identical contents (e.g. after `.map()` or `.filter()`), pass **`equals`**—either a custom predicate or the built-in **`shallowEqual`** / **`deepEqual`** helpers:

```typescript
import { ReactiveEngine, shallowEqual, deepEqual } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// 1. Shallow equality for flat objects in signal()
const coords = engine.signal({ x: 10, y: 20 }, { name: 'ui:coords', equals: shallowEqual })

// 2. Deep structural equality for nested arrays/DTOs in computed()
const rawList = engine.signal([1, 2, 3], 'data:raw')
const mappedList = engine.computed(
  () => rawList.value.map((n) => ({ id: n, even: n % 2 === 0 })),
  { name: 'data:mapped', equals: deepEqual }
)
```
