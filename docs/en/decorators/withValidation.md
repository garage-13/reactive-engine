# `withValidation(Sync|Async)`

The `withValidation(Sync|Async)` decorators provides a validation mechanism for synchronous actions and asynchronous fetchers within a reactive system. It allows checking the state before executing an action or fetching data, ensuring the correctness of operations.

## Syntax

```typescript
// For synchronous actions
export const withValidationSync = <T, Args extends any[], R>(
  targetAction: (...args: Args) => R,
  options: ValidationOptions<T>
): ((currentState: T, ...args: Args) => R | void)

// For asynchronous fetchers
export const withValidationAsync = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ValidationOptions<S>
): ((sourceValue: S, abortSignal: AbortSignal) => Promise<T>)
```

**Validation Options Types:**

```typescript
export type ValidationSchema<T> = {
  [K in keyof T]?: (value: T[K], state: T) => string | true
}

export interface ValidationOptions<T> {
  schema: ValidationSchema<T>
  errorsSignal: Signal<Record<string, string>>
}
```

## Parameters

- **targetAction** (`(...args: Args) => R`): The synchronous function or method to be wrapped with validation.
- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): The asynchronous fetcher to be wrapped with validation.
- **options** (`ValidationOptions<T>`):
  - **schema** (`ValidationSchema<T>`): An object schema where keys correspond to state fields and values are validator functions.
  - **errorsSignal** (`Signal<Record<string, string>>`): A signal for accumulating validation errors.

## Return Value

- **withValidationSync**: Returns a wrapped function that takes the current state and action arguments. If data is valid, it executes the target action and returns the result; if not, it returns `undefined` and records errors in `errorsSignal`.
- **withValidationAsync**: Returns a wrapped function that takes source data and an abort signal. If data is valid, it executes the fetcher and returns the result; if not, it throws an exception `'Core validation stopper'` and records errors in `errorsSignal`.

## Examples

### Basic Usage Scenario for Synchronous Decorator

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationSync, ValidationSchema } from './withValidation'

interface TestState {
  step: number
  username: string
  email: string
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema: ValidationSchema<TestState> = {
  step: (val) => (val > 0 ? true : 'Step must be greater than zero')
}

const targetAction = (multiplier: number) => 42 * multiplier
const validatedAction = withValidationSync(targetAction, { schema, errorsSignal })

const currentState: TestState = { step: 1, username: 'dan', email: 'test@test.com' }
const result = validatedAction(currentState, 2)

console.log(result) // 84
console.log(errorsSignal.value) // {}
```

### Basic Usage Scenario for Asynchronous Decorator

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationAsync, ValidationSchema } from './withValidation'

interface TestState {
  step: number
  username: string
  email: string
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema: ValidationSchema<TestState> = {
  email: (val) => (val.endsWith('.com') ? true : 'Only .com domain is allowed')
}

const mockFetcher = async (source: TestState, _signal: AbortSignal) => ({ id: 202, status: 'active' })
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const validSource: TestState = { step: 1, username: 'dan', email: 'dan@reactive.com' }
const result = await validatedFetcher(validSource, new AbortController().signal)

console.log(result) // { id: 202, status: 'active' }
console.log(errorsSignal.value) // {}
```

### Cross-Validation Scenario

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationSync, ValidationSchema } from './withValidation'

interface TestState {
  step: number
  username: string
  email: string
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema: ValidationSchema<TestState> = {
  username: (val, state) => {
    if (state.step === 2 && val !== 'admin') {
      return 'Username must be admin on step 2'
    }
    return true
  }
}

const targetAction = () => {}
const validatedAction = withValidationSync(targetAction, { schema, errorsSignal })

const state: TestState = { step: 2, username: 'guest', email: 'admin@test.com' }
validatedAction(state)

console.log(errorsSignal.value.username) // 'Username must be admin on step 2'
```

### Asynchronous Fetcher with Error Handling

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationAsync, ValidationSchema } from './withValidation'

interface TestState {
  step: number
  username: string
  email: string
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema: ValidationSchema<TestState> = {
  step: (val) => (val > 0 ? true : 'Invalid source step')
}

const mockFetcher = async (_source: TestState, _signal: AbortSignal) => ({ ok: true })
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const invalidSource: TestState = { step: -5, username: 'anonymous', email: 'anon@mail.ru' }

try {
  await validatedFetcher(invalidSource, new AbortController().signal)
} catch (error) {
  console.error(error.message) // 'Core validation stopper'
}

console.log(errorsSignal.value.step) // 'Invalid source step'
```

### Integration with Resource and Reactive Graph

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationAsync, ValidationSchema } from './withValidation'

interface User {
  age: number
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema = {
  age: (val: number) => (val >= 18 ? true : 'Age must be strictly 18+')
}

const mockFetcher = async (user: User, _sig: AbortSignal) => `processed_${user.age}`
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const sourceSignal = engine.signal({ age: 20 }, 'resource:source')
const userResource = engine.resource(validatedFetcher, sourceSignal, 'user:validated:resource')

await new Promise(r => setTimeout(r, 10)) // Wait for internal effects to run

console.log(userResource.data) // processed_20
console.log(errorsSignal.value) // {}

sourceSignal.value = { age: 16 } // Mutate the source to an invalid value

await new Promise(r => setTimeout(r, 10)) // Wait for internal effects to run

console.log(userResource.error) // Contains 'Core validation stopper'
console.log(errorsSignal.value.age) // 'Age must be strictly 18+'
```

## Additional Information

The `withValidation(Sync|Async)` decorators integrates with the core of the reactive system, providing transparent validation of state before executing actions and fetchers. It supports both synchronous and asynchronous operations, allowing developers to control data flow and handle validation errors effectively.

To use the decorator, you need to pass the target action or fetcher, as well as an options object containing the validation schema and a signal for accumulating errors. In case of schema validation failure, the decorator blocks the operation execution and records corresponding errors in the specified signal.
