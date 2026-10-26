# `effect`

The `effect` method allows you to create automatic functions that execute when dependent signals change. These effects can be used to update the UI or other dependencies.

## Overview

Effects are an important part of the reactive system, allowing automatic updates to the UI and other dependencies when signal values change. The `effect` method takes a function that will be executed whenever its dependent signals change, and optionally a label for logging and debugging purposes.

## Syntax

```typescript
engine.effect(fn: EffectFn, label?: string): () => void;
```

## Parameters

- **fn** (`EffectFn`): The effect function that will be executed when dependent signals change.
- **label** (`string`, optional): A label for logging and debugging purposes.

## Return Value

The method returns a cleanup function. Calling this function removes the effect and its subscribers.

## Examples

### 1. Basic Example in Plain TypeScript

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'count' });

engine.effect(() => {
  console.log(`Count is now ${count.value}`);
});

count.value++; // Outputs: Count is now 1
```

### 2. Advanced Example with Validation and Logging

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const count = engine.signal(0, { name: 'count' });

engine.effect(() => {
  if (count.value < 0) {
    console.error('Count cannot be negative!');
  }
}, 'negativeCountCheck');

count.value = -1; // Outputs: Count cannot be negative!
```

### 3. Integration  via DI Container

#### JS
```ts
class CounterService extends AbstractService {
  countSignal = engine.signal(0, { name: '=count=' });

  increment = () => {
    this.countSignal.value += 1;
  };
}

const logic = engine.inject(CounterService);

console.log(logic.countSignal.value) // Out: 0

logic.increment()
logic.increment()
logic.increment()

console.log(logic.countSignal.value) // Out: 3
```

#### with React

```typescript
import React from 'react';
import { AbstractService, ReactiveEngineCore } from './core';

class CounterService extends AbstractService {
  public countSignal = engine.signal(0, { name: 'count' });

  public increment = (): void => {
    this.countSignal.value += 1;
  };
}

const engine = new ReactiveEngineCore();
const logic = engine.inject(CounterService);

export function MyComponent(): React.JSX.Element {
  const count = engine.use<number>(logic.countSignal);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={logic.increment}>Increment</button>
    </div>
  );
}
```

### 4. Handling Cyclic Dependencies

**Architectural Resilience of Cross-Dependencies** - `ReactiveEngine` demonstrates exceptional resilience and stability when handling complex, cross-linked dependencies between isolated components. Unlike naive reactive systems that easily fall into infinite feedback loops when updates bounce between multiple effects, the core library guarantees the mathematical convergence of the entire graph. The wave of updates propagates safely until the values stabilize, at which point the internal **Equality Cut-Off** mechanism (powered by `Object.is` value comparison) instantly suppresses the transaction and halts further execution, seamlessly preventing stack overflow errors.

```typescript
import { ReactiveEngineCore } from './core';

const engine = new ReactiveEngineCore();
const a = engine.signal(0, { name: 'a' });
const b = engine.signal(0, { name: 'b' });

engine.effect(() => {
  a.value = b.value + 1;
}, 'effectA');

engine.effect(() => {
  b.value = a.value + 1;
}, 'effectB');

a.value = 1; // ✅ Will not throws an error due to cyclic dependency
```

## Internal Mechanics & Edge Cases

### Initialization of Effects

When an effect is created, it runs immediately after registration. If the effect function returns another function, this returned function will be used for cleanup when the effect is disposed.

```typescript
const engine = new ReactiveEngineCore();
const cleanup = engine.effect(() => {
  console.log('Effect is running');
  return () => {
    console.log('Cleanup function called');
  };
});

cleanup(); // Calls the cleanup function and removes the effect
```

### Transaction Logging

If logging is enabled, each execution of an effect will be logged with the corresponding label.

```typescript
const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const count = engine.signal(0, { name: 'count' });

engine.effect(() => {
  console.log(`Count is now ${count.value}`);
}, 'logEffect');

count.value++; // Logs: EFFECT logEffect Count is now 1
```

### Error Handling

If the effect function throws an exception, all remaining effects in the queue will be immediately cleaned up and marked as stable.

```typescript
engine.effect(() => {
  throw new Error('Something went wrong');
}, 'errorEffect');

// All subsequent effects in the queue are skipped
```

### Batching Updates

Updates inside `engine.batch()` are grouped and executed only after the batch completes.

```typescript
const engine = new ReactiveEngineCore();
const count = engine.signal(0, { name: 'count' });

engine.batch(() => {
  count.value = 1;
  count.value = 2;
});

// Logs contain only one update: EFFECT logEffect Count is now 2
```

### Dependency Tracking

An effect automatically tracks all signals used within the effect function. When these signals change, the effect will be re-executed.

```typescript
const engine = new ReactiveEngineCore();
const a = engine.signal(0);
const b = engine.signal(0);

engine.effect(() => {
  console.log(`Sum is ${a.value + b.value}`);
}, 'sumEffect');

// -- Single REACTIVE TRANSACTION
a.value = 1; // Logs: Sum is 1
b.value = 2; // Logs: Sum is 3
// --
```

## Notes

- ⛔ **Avoiding `engine.provide(Service, Service)`**: Do not use `engine.provide(Service, Service)`, as it is redundant. Use `engine.inject(Service)` to automatically create singletons.
- **Using `console.log()`**: Instead of test assertions, use `console.log()` to output results and verify states.
- **Asynchronous Operations**: For asynchronous operations, use `await` inside the effect function.

This method provides a powerful tool for creating reactive effects that automatically update when dependent signals change.
