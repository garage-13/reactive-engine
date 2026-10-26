# `reactive`

The `reactive` method creates a deeply reactive object (Proxy) based on the provided target object or array. Unlike atomic signals (`signal`), which require manual access through `.value`, the `reactive` method allows working with complex nested data structures natively using standard JavaScript syntax for reading and direct mutation of properties.

## Overview

The `reactive` method creates reactive objects that automatically track changes to their properties and notify subscribers about these changes. This is particularly useful for working with complex data, such as forms or application states.

## Syntax

```typescript
engine.reactive(target: object | array, name?: string): Proxy
```

### Parameters

- **target:** The initial JavaScript object or array to be proxied.
- **name (optional):** A unique base name for the object for tracing and filtering in the logger.

## Returns

A deeply proxied reactive object of type `T`.

## Examples

### 1. Pure TypeScript Example (Base)

```typescript
// Initialization in a business logic service:
const engine = new ReactiveEngineCore();
const form = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

// Direct mutation in an action (Proxy will intercept the tick and start atomic batching):
function updateAge() {
  form.user.age += 1; // Automatic log: SIGNAL [profile-form.user.age]
}

// Subscription bridge for UI components:
const uiBridge = engine.computed(() => ({
  name: form.user.name,
  age: form.user.age
}));

console.log(uiBridge.value); // { name: 'John', age: 25 }
updateAge();
console.log(uiBridge.value); // { name: 'John', age: 26 }
```

### 2. Advanced Lifecycle Example

```typescript
// Initialization in a business logic service:
const engine = new ReactiveEngineCore();
const form = engine.reactive({
  user: { name: 'John', age: 148 }
}, 'profile-form');

// Direct mutation with custom validation:
function updateAge() {
  const newValue = form.user.age + 1;
  if (newValue > 150) {
    console.error('Age cannot be greater than 150');
  } else {
    form.user.age = newValue; // Automatic log: SIGNAL [profile-form.user.age]
  }
}

// Subscription bridge for UI components:
const uiBridge = engine.computed(() => ({
  name: form.user.name,
  age: form.user.age
}));

// -- Single REACTIVE TRANSACTION
updateAge();
updateAge();
updateAge(); // Error: Age cannot be greater than 150
// --

console.log(uiBridge.value); // Log: {name: 'John', age: 150}
```

### 3. Mutation & Loop Protection Example
This example clearly demonstrates three key architectural capabilities of proxied objects and the transactional logger implementation within the `@pravosleva/reactive-engine` library:
- Deep Reactivity & Imperative Mutations of Nested Structures
- Native Batching for Object and Array Mutations
- Automated Loop Protection on Sequential Batch Writes

```typescript
// Initialization in a business logic service:
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

// Direct mutation with loop protection:
function incAge() {
  for (let i = 0; i < 10; i++) {
    state.user.age += 1;
  }
}

incAge();
console.log(state.user.age); // 35
```

### Working with Reactive Arrays

The `engine.reactive` method provides native, deep reactive capabilities for arrays. You can perform in-place mutations using standard methods (`.push()`, `.splice()`, etc.) without explicit array spreading. The core automatically batches internal property writes and composition changes into a single atomic transaction.

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine';

interface ITodoItem {
  id: number;
  text: string;
}

const engine: ReactiveEngine = new ReactiveEngine({ logger: { isEnabled: true } });

// 1. Initialize a deeply reactive array of objects
const todoList: ITodoItem[] = engine.reactive<ITodoItem[]>([
  { id: 1, text: 'Buy milk' }
], 'todo-list-array');

// 2. Subscription Option #1: Standard engine.effect tracker
engine.effect((): void => {
  console.log(`[Effect] Total todo count: ${todoList.length}`);
  if (todoList.length > 0) {
    console.log(`[Effect] Latest todo task: ${todoList[todoList.length - 1].text}`);
  }
}, 'todo-monitor-effect');

// 3. Subscription Option #2: Direct array subscription via native __subscribe hook
// Automatically wakes up whenever the array length or structure gets mutated
const unsubscribe: () => void = (todoList as any).__subscribe((currentLength: number): void => {
  console.log(`[__subscribe] Array structure changed! New length: ${currentLength}`);
});

// 4. Imperative mutations (under-the-hood batched by the core engine)
function modifyTodos(): void {
  // Directly append items without complex spread operations ([...arr])
  todoList.push({ id: 2, text: 'Write DI container unit tests' });
  todoList.push({ id: 3, text: 'Generate method docs update patch' });

  // Remove the very first element in-place
  todoList.splice(0, 1);
}

// Execute batch mutations
modifyTodos();

// The transactional logger will capture exactly one aggregated batch flush,
// with the array length shifting to 2 and containing the remaining production tasks.

// Safely clean up the direct subscription when no longer needed
unsubscribe();
```

### 4. Dependency Injection & React Integration

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

## Internal Mechanics & Edge Cases

### Initialization with Initial Value

When creating a reactive object, all its properties are automatically wrapped in signals. If a property is an object or array, it is also proxied recursively.

```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

console.log(state.user.name); // John
```

### Custom Validation Execution

The `reactive` method does not support built-in validation mechanisms. However, you can implement custom checks during property mutations.

```typescript
function updateAge() {
  const newValue = form.user.age + 1;
  if (newValue > 100) {
    console.error('Age cannot be greater than 100');
  } else {
    form.user.age = newValue; // Automatic log: SIGNAL [profile-form.user.age]
  }
}
```

### Transactional Log Logging Behavior

Logging of reactive operations occurs automatically when values change. You can configure the logger for debugging.

```typescript
const engine = new ReactiveEngineCore({ logger: { isEnabled: true } });
const state = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

state.user.age = 26; // Log: SIGNAL [profile-form.user.age] 25 → 26
```

### Batching Updates via `engine.batch()`

The `engine.batch()` method allows grouping multiple mutations into a single transaction, which improves performance and prevents unnecessary re-renders.

```typescript
engine.batch(() => {
  state.user.age = 26;
  state.user.name = 'Jane';
});

// Log: SIGNAL [profile-form.user.age] 25 → 26, SIGNAL [profile-form.user.name] John → Jane
```

### Dependency Tracking

Dependencies are tracked at the property level. Changing one property does not trigger recalculations of other unaffected properties.

```typescript
const engine = new ReactiveEngineCore();
const state = engine.reactive({
  user: { name: 'John', age: 25 }
}, 'profile-form');

engine.effect(() => {
  console.log(state.user.name);
});

state.user.age = 26; // Log: John (effect does not trigger)
state.user.name = 'Jane'; // Log: Jane
```
