# `resource`

The `resource` method allows creating asynchronous resources that automatically update their dependencies when the data changes.

## Overview

The `resource` method is designed to work with asynchronous operations, such as fetching data from a network. It automatically manages loading states, errors, and retry attempts for request execution. The method returns an object `Resource`, which provides access to the current state of the resource and methods to manage it.

## Syntax

```javascript
engine.resource(fetcher, source, optionsOrName)
```

## Parameters

- **fetcher** (`Function`): An asynchronous function to load data.
  - Takes two arguments: `source` and `signal`.
  - Returns a promise with data of type `T`.

- **source** (`{ value: S }`): The source of data, which depends on a signal or computed.

- **optionsOrName** (`string | ResourceOptions<T, S>`): Name or options for the resource.

## Return Value

The method returns an object `Resource`, which has the following properties and methods:

- **`data`**: Data of the resource.
- **`loading`**: Loading state of the resource (true/false).
- **`error`**: Error if an error occurred during data loading.
- **`isRetrying`**: Flag indicating whether a retry is happening.
- **`value`**: Full object state of the resource (`ResourceState<T>`).
- **`refetch()`**: Method to force reload the resource.
- **`subscribe(cb: (val: ResourceState<T>) => void)`**: Subscription to changes in the resource state. Returns a function to clear the subscription.

## Examples

### Pure TypeScript Example (Base)

```typescript
import { ReactiveEngineCore } from './core';

interface User {
  id: number;
  name: string;
}

const engine = new ReactiveEngineCore();

const fetchData = async (source: User, signal: AbortSignal): Promise<User> => {
  // Implementation of fetching user data
};

const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' });
const userResource = engine.resource(fetchData, { value: userSignal.value }, { name: 'userResource' });

userResource.subscribe((state) => {
  console.log('Resource state:', state);
});

userSignal.value.id++; // Will trigger a resource reload
```

### Advanced Lifecycle Example

```typescript
import { ReactiveEngineCore } from './core';

interface User {
  id: number;
  name: string;
}

const engine = new ReactiveEngineCore();

const fetchData = async (source: User, signal: AbortSignal): Promise<User> => {
  // Implementation of fetching user data with custom validation and retry logic
};

const userSignal = engine.signal<User>({ id: 1, name: 'John Doe' }, {
  validate: (user) => user.id > 0 && typeof user.name === 'string'
});

const userResource = engine.resource(fetchData, { value: userSignal.value }, {
  name: 'userResource',
  timeout: 5000,
  retryCount: 3,
  responseValidate: (data) => !!data || 'Data is empty'
});

userResource.subscribe((state) => {
  console.log('Resource state:', state);
});

userSignal.value.id++; // Will trigger a resource reload
```

### Mutation & Loop Protection Example

```typescript
import { ReactiveEngineCore } from './core';

interface User {
  id: number;
  name: string;
}

const engine = new ReactiveEngineCore();

class UserService extends AbstractService {
  public userSignal: Signal<User> = this.engine.signal<User>(
    { id: 1, name: 'John Doe' },
    { name: 'userSignal' }
  );

  public incId = (): void => {
    this.userSignal.value.id += 1;
    this.userSignal.value = this.userSignal.value; // Ping setter for object mutations
  };
}

const engine: ReactiveEngineCore = new ReactiveEngineCore();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  const user: User = engine.use<User>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```


### Dependency Injection & React Integration Examples

#### Option A: 🫤 State Management via `engine.signal` (Base Primitive Approach)

This approach uses traditional atomic reactive primitives. Since signal only tracks root reference mutations, changing nested properties inside an object requires an explicit re-assignment to wake up the dependency graph.

```tsx
import React from 'react';
import { AbstractService, ReactiveEngine, Signal } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Initialize an atomic signal holding the object structure
  public userSignal: Signal<UserState> = this.engine.signal<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'userSignal' }
  );

  public incId = (): void => {
    // 1. Mutate the nested property imperatively
    this.userSignal.value.id += 1;
    // 2. CRITICAL: Re-assign the value to itself (ping the setter)
    this.userSignal.value = this.userSignal.value;
    // ☝️ Because the object reference didn't change, we must manually trigger the graph
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  // Bind the component lifecycle to the atomic signal node
  const user: UserState = engine.use<UserState>(logic.userSignal);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

_Architectural constraints of the signal approach:_
- **Manual Dependency Pinging:** Mutating a nested property like `id` does not change the top-level object reference. You must always invoke the signal setter explicitly (`signal.value = signal.value`), which introduces boilerplate code into production actions.
- **Verbose Accessors:** You are required to read values via the `.value` property inside your service methods, treating complex data as an encapsulated container instead of a regular JavaScript object.

#### Option B: 😉 State Management via `engine.reactive` (Deep Proxy-Wrapped Approach)

An equivalent, strictly typed alternative utilizing deep proxy tracking. Notice the absolute purity of the `incId` method—it allows for true standard mutations entirely free of technical overhead.

```tsx
import React from 'react';
import { AbstractService, ReactiveEngine } from '@pravosleva/reactive-engine';

interface UserState {
  id: number;
  name: string;
}

class UserService extends AbstractService {
  // Initialize a deeply reactive proxy-wrapped object
  // Typed as a plain UserState object instead of a Signal container
  public userProfile: UserState = this.engine.reactive<UserState>(
    { id: 1, name: 'John Doe' },
    { name: 'user-profile-reactive' }
  );

  public incId = (): void => {
    // No more .value accessors or manual setter pings required!
    this.userProfile.id += 1;
    // 👌 Clean, native, and completely safe imperative mutation
  };
}

const engine: ReactiveEngine = new ReactiveEngine();
const logic: UserService = engine.inject(UserService); // Autowired singleton instance

export function MyComponent(): React.JSX.Element {
  // Bind the React component directly to the reactive proxy object
  const user: UserState = engine.use<UserState>(logic.userProfile);

  return (
    <div>
      <p>ID: {user.id} | Name: {user.name}</p>
      <button onClick={logic.incId}>Increment ID</button>
    </div>
  );
}
```

_Key architectural advantages of the reactive approach:_
- **Clean Data Types:** The `userProfile` property preserves its pure `UserState` type instead of being wrapped into `Signal<UserState>`. This drastically simplifies external utility integrations and standard TypeScript typing, as the state behaves like a standard POJO (Plain Old JavaScript Object).
- **No `.value` Accessors:** Property access remains entirely native. The need to append .value disappears completely from both your business logic class and your React components.
This direct comparison perfectly highlights the architectural value of utilizing `engine.reactive` over basic atomic `signals` when designing state layers around complex data structures and deeply nested objects.

## Additional Information

Resources are an important part of the reactive system, allowing automatic updates to UI and other dependencies when data changes.
