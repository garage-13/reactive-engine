# `computed`

The `computed` method allows creating computed values that automatically update when their dependent signals change.

## Overview

Computed values are a fundamental part of the reactive system, enabling automatic updates to UI and other dependencies based on changes in dependent signals. This method provides a way to define functions whose return values depend on one or more signals, ensuring that these values are recalculated only when necessary.

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

### Pure TypeScript Example (Base)

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore();
const count = engine.signal(0);
const doubledCount = engine.computed(() => count.value * 2);

doubledCount.subscribe((newValue) => {
  console.log(`Doubled Count is now ${newValue}`);
});

count.value++; // Outputs: Doubled Count is now 2
```

### Advanced Lifecycle Example

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore();
interface User { id: number; name: string; }
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

const userNameLength = engine.computed(() => userSignal.value.name.length);
const hasLongName = engine.computed(() => userNameLength.value > 5);

console.log(hasLongName.value); // Outputs: false
userSignal.value = { id: 1, name: 'Johnathan' };
console.log(userNameLength.value); // Outputs: 9
console.log(hasLongName.value); // Outputs: true
```

## Mutation & Loop Protection Example

When working with complex states (objects or arrays), mutations inside properties do not automatically trigger the reactive graph because the object reference remains identical. To force an update, you must assign the object back to itself.

However, doing this inside an `effect` that reads from the same signal creates a dangerous cyclic dependency. The core engine detects this pattern using its internal `activeConsumer` tracking and safely blocks synchronous recursion, preventing a `Maximum call stack size exceeded` error (Stack Overflow).

```typescript
import { ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface ICounterState {
  clicks: number;
  label: string;
}

const engine: ReactiveEngine = new ReactiveEngine();

// Create a reactive signal to manage the counter state
const counterSignal: Signal<ICounterState> = engine.signal<ICounterState>(
  { clicks: 0, label: 'Initialization' },
  { name: 'counter-signal' }
);

// Danger Zone: Create an effect that triggers a cyclic dependency.
// The effect simultaneously READS from and WRITES to the exact same signal.
engine.effect((): void => {
  // 1. Read the value (the effect subscribes to counterSignal updates)
  const currentClicks: number = counterSignal.value.clicks;
  console.log(`[Effect] Reacting to changes. Current clicks: ${currentClicks}`);

  // 2. Mutate the state imperatively inside the current execution thread
  counterSignal.value.clicks += 1;
  counterSignal.value.label = `Click #${counterSignal.value.clicks}`;

  // 3. Re-assign the value to itself to wake up the dependency graph.
  // WITHOUT internal core protection, this would cause infinite synchronous recursion
  // and instantly crash the V8 runtime with a Stack Overflow exception.
  counterSignal.value = counterSignal.value;
}, 'cyclic-protection-effect');

// Check the final state after the core's safety barrier interceptor takes action.
// The effect ran exactly once. The recursive synchronous feedback loop was blocked.
console.log(`[Final] Counter successfully incremented exactly once: ${counterSignal.value.clicks}`); // Outputs: 1
```

### Dependency Injection & React Integration

```typescript
import React from 'react';
import { AbstractService, ReactiveEngineCore, Signal } from './core';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' },
    {
      name: 'userSignal',
      validate: (v) => typeof v.id === 'number'
    },
  );

  public incId = (): void => {
    this.userSignal.value.id += 1;
    this.userSignal.value = this.userSignal.value; // Ping setter for object mutations
  };

  doubledId = this.engine.computed(() => this.userSignal.value.id * 2, 'x2')
}

const engine = new ReactiveEngineCore();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  const user: UserState = engine.use<UserState>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

## Additional Information

Computed values are a fundamental part of the reactive system, allowing automatic updates to UI and other dependencies when dependent signals change.
