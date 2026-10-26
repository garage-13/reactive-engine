# `signal`

The `signal` method allows creating reactive variables that automatically update their subscribers when the value changes.

## Overview

The `signal` method is a fundamental part of the reactive system, enabling automatic updates to UI and other dependencies when values change. It supports initial value assignment, custom validation execution, transactional log logging behavior, batching updates via `engine.batch()`, and dependency tracking.

## Syntax

```javascript
engine.signal(initialValue, optionsOrName)
```

## Parameters

- **initialValue** (`T`): The initial value of the signal.
- **optionsOrName** (`string | SignalOptions<T>`): Name or options for the signal.

## Return Value

The method returns a `Signal` object with the following properties and methods:

- **`value`**: The value of the signal.
- **`subscribe(cb: (val: T) => void)`**: Subscribe to changes in the signal's value. Returns a cleanup function.

## Examples

### Pure TypeScript Example (Base)

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'counter' });

count.subscribe((newValue) => {
  console.log(`Count is now ${newValue}`);
});

count.value++; // Outputs: Count is now 1
```

### Advanced Lifecycle Example

```typescript
interface User { id: number; name: string; }
const engine = new ReactiveEngineCore();
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

userSignal.value = { id: -1, name: 'Jane Doe' }; // Outputs validation error
```

### Mutation & Loop Protection Example

```typescript
const tagsSignal = engine.signal(['js']);
const spy = () => {
  console.log(tagsSignal.value.join(', '));
};

engine.effect(spy);

// Direct object/array mutations
tagsSignal.value.push('ts');
tagsSignal.value.push('vue');
tagsSignal.value.splice(1, 1); // Remove 'ts'

// Pinning setter to itself
tagsSignal.value = tagsSignal.value;

// Outputs: js, vue
```

### Dependency Injection & React Integration

```typescript
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Pure class field initialization with strict typing
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' }, 
    { name: 'userSignal' }
  );

  public incId = (): void => {
    this.userSignal.value.id += 1;
    this.userSignal.value = this.userSignal.value; // Ping setter for object mutations
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  // Correctly use engine.use() hook to bind reactive nodes to React lifecycle
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

### Initial Value Assignment

When creating a signal with the `signal` method, the provided initial value is set as the current value of the signal. If the value changes, any subscribers to the signal will be automatically updated.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0);

console.log(count.value); // Outputs: 0

count.value = 1;
console.log(count.value); // Outputs: 1
```

### Custom Validation Execution

The `signal` method supports optional custom validation functions that can check and block the setting of invalid values.

```typescript
interface User { id: number; name: string; }
const engine = new ReactiveEngineCore();
const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  name: 'user',
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

userSignal.value = { id: -1, name: 'Jane Doe' }; // Outputs validation error
console.log(userSignal.value); // Outputs: { id: 1, name: 'John Doe' }
```

### Transactional Log Logging Behavior

The `signal` method automatically logs changes in values to the reactive operation logging system. This allows tracking and debugging of system behavior.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'counter' });

count.subscribe((newValue) => {
  console.log(`Count is now ${newValue}`);
});

count.value++; // Outputs: Count is now 1
```

### Batching Updates via `engine.batch()`

The `batch` method allows grouping multiple value changes into a single transaction, improving performance and preventing unnecessary updates to dependencies.

```typescript
const engine = new ReactiveEngineCore();
const count1 = engine.signal(0);
const count2 = engine.signal(0);

engine.batch(() => {
  count1.value++;
  count2.value++;
});

console.log(count1.value); // Outputs: 1
console.log(count2.value); // Outputs: 1
```

### Dependency Tracking

Signals automatically track dependencies that depend on their values. This allows for efficient updates to only those parts of the system that have actually changed.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0);
let doubledCount = 0;

engine.effect(() => {
  doubledCount = count.value * 2;
});

console.log(doubledCount); // Outputs: 0

count.value++;
console.log(doubledCount); // Outputs: 2
```

These examples and explanations demonstrate the main capabilities and features of the `signal` method in the reactive system.
