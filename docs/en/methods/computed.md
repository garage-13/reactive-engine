# `computed`

The `computed` method allows creating computed values that automatically update when their dependent signals change.

## Syntax

```javascript
engine.computed(fn, optionsOrName)
```

## Parameters

- **fn** (`Function`): Function to compute the value.
- **optionsOrName** (`string | ComputedOptions<T>`): Name or options for the computed value.

## Return Value

The method returns a `Computed` object with the following properties and methods:

- **`value`**: The value of the computed value.
- **`subscribe(cb: (val: T) => void)`**: Subscribe to changes in the computed value. Returns a cleanup function.
- **`destroy()`**: Forcefully destroy the computed value and its effect to prevent memory leaks.

## Examples

### Example in Plain JavaScript

```javascript
const engine = new ReactiveEngine();
const count = engine.signal(0);
const doubledCount = engine.computed(() => count.value * 2);

doubledCount.subscribe((newValue) => {
  console.log(`Doubled Count is now ${newValue}`);
});

count.value++; // Outputs: Doubled Count is now 2
```

### Example in React

```jsx
import { ReactiveEngine } from '@pravosleva/reactive-engine';
import clsx from 'clsx';

const engine = new ReactiveEngine({
  logger: {
    isEnabled: true, // Enable the logger
    traceTime: true, // Add timing output as desired
    filter: /^example-*/ // You can filter only relevant logs
  }
});

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-100:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-100:computed:counter');

  public inc = () => {
    this.counter.value += 1;
  }
}

export const Example100 = () => {
  const logic = engine.inject(Logic);
  const counter = engine.use(logic.counter);
  const doubledCounter = engine.use(logic.doubledCounter);

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Computed</div>
      <code>{counter} | x2 = {doubledCounter}</code>
      <div className={baseClasses.catSection}>
        <button
          onClick={logic.inc}
          className={clsx(btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])}
        >INC</button>
      </div>
    </div>
  );
};
```

## Additional Information

Computed values are a fundamental part of the reactive system, allowing automatic updates to UI and other dependencies when dependent signals change.
