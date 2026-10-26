# `withValidation(Sync|Async)`

Декораторы `withValidation(Sync|Async)` предоставляет механизм валидации для синхронных экшенов и асинхронных фетчеров в реактивной системе. Он позволяет проверять состояние перед выполнением действия или запроса данных, обеспечивая корректность операций.

## Синтаксис

```typescript
// Для синхронных экшенов
export const withValidationSync = <T, Args extends any[], R>(
  targetAction: (...args: Args) => R,
  options: ValidationOptions<T>
): ((currentState: T, ...args: Args) => R | void)

// Для асинхронных фетчеров
export const withValidationAsync = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ValidationOptions<S>
): ((sourceValue: S, abortSignal: AbortSignal) => Promise<T>)
```

**Типы опций валидации:**

```typescript
export type ValidationSchema<T> = {
  [K in keyof T]?: (value: T[K], state: T) => string | true
}

export interface ValidationOptions<T> {
  schema: ValidationSchema<T>
  errorsSignal: Signal<Record<string, string>>
}
```

## Параметры

- **targetAction** (`(...args: Args) => R`): Синхронная функция или метод, который нужно обернуть валидацией.
- **fetcher** (`(source: S, signal: AbortSignal) => Promise<T>`): Асинхронный фетчер, который нужно обернуть валидацией.
- **options** (`ValidationOptions<T>`):
  - **schema** (`ValidationSchema<T>`): Объект схемы валидации, где ключи соответствуют полям состояния, а значения — функции валидатора.
  - **errorsSignal** (`Signal<Record<string, string>>`): Сигнал для накопления ошибок валидации.

## Возвращаемое значение

- **withValidationSync**: Возвращает обёрнутую функцию, которая принимает текущее состояние и аргументы экшена. Если данные валидны, выполняет целевое действие и возвращает результат; если нет — возвращает `undefined` и записывает ошибки в `errorsSignal`.
- **withValidationAsync**: Возвращает обёрнутую функцию, которая принимает источник данных и сигнал прерывания. Если данные валидны, выполняет фетчер и возвращает результат; если нет — выбрасывает исключение `'Core validation stopper'` и записывает ошибки в `errorsSignal`.

## Примеры

### Базовый сценарий использования синхронного декоратора

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
  step: (val) => (val > 0 ? true : 'Шаг должен быть больше нуля')
}

const targetAction = (multiplier: number) => 42 * multiplier
const validatedAction = withValidationSync(targetAction, { schema, errorsSignal })

const currentState: TestState = { step: 1, username: 'dan', email: 'test@test.com' }
const result = validatedAction(currentState, 2)

console.log(result) // 84
console.log(errorsSignal.value) // {}
```

### Базовый сценарий использования асинхронного декоратора

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
  email: (val) => (val.endsWith('.com') ? true : 'Разрешена только зона .com')
}

const mockFetcher = async (source: TestState, _signal: AbortSignal) => ({ id: 202, status: 'active' })
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const validSource: TestState = { step: 1, username: 'dan', email: 'dan@reactive.com' }
const result = await validatedFetcher(validSource, new AbortController().signal)

console.log(result) // { id: 202, status: 'active' }
console.log(errorsSignal.value) // {}
```

### Сценарий с кросс-валидацией

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
      return 'На втором шаге имя должно быть admin'
    }
    return true
  }
}

const targetAction = () => {}
const validatedAction = withValidationSync(targetAction, { schema, errorsSignal })

const state: TestState = { step: 2, username: 'guest', email: 'admin@test.com' }
validatedAction(state)

console.log(errorsSignal.value.username) // 'На втором шаге имя должно быть admin'
```

### Сценарий с асинхронным фетчером и обработкой ошибок

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
  step: (val) => (val > 0 ? true : 'Некорректный шаг источника')
}

const mockFetcher = async (_source: TestState, _signal: AbortSignal) => ({ ok: true })
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const invalidSource: TestState = { step: -5, username: 'anonymous', email: 'anon@mail.ru' }

try {
  await validatedFetcher(invalidSource, new AbortController().signal)
} catch (error) {
  console.error(error.message) // 'Core validation stopper'
}

console.log(errorsSignal.value.step) // 'Некорректный шаг источника'
```

### Интеграция с ресурсом и реактивным графом

```typescript
import { ReactiveEngine } from '../../core'
import { withValidationAsync, ValidationSchema } from './withValidation'

interface User {
  age: number
}

const engine = new ReactiveEngine()
const errorsSignal = engine.signal<Record<string, string>>({}, 'validation:errors')

const schema = {
  age: (val: number) => (val >= 18 ? true : 'Возраст должен быть строго 18+')
}

const mockFetcher = async (user: User, _sig: AbortSignal) => `processed_${user.age}`
const validatedFetcher = withValidationAsync(mockFetcher, { schema, errorsSignal })

const sourceSignal = engine.signal({ age: 20 }, 'resource:source')
const userResource = engine.resource(validatedFetcher, sourceSignal, 'user:validated:resource')

await new Promise(r => setTimeout(r, 10)) // Прокручиваем макрозадачи для прогона внутренних эффектов ресурса

console.log(userResource.data) // processed_20
console.log(errorsSignal.value) // {}

sourceSignal.value = { age: 16 } // Императивно мутируем источник до невалидного значения

await new Promise(r => setTimeout(r, 10)) // Прокручиваем макрозадачи для прогона внутренних эффектов ресурса

console.log(userResource.error) // содержит 'Core validation stopper'
console.log(errorsSignal.value.age) // 'Возраст должен быть строго 18+'
```

## Дополнительная информация

Декораторы `withValidation(Sync|Async)` интегрируется с ядром реактивной системы, обеспечивая прозрачную валидацию состояния перед выполнением экшенов и фетчеров. Он поддерживает как синхронные, так и асинхронные операции, позволяя разработчикам контролировать поток данных и обрабатывать ошибки валидации эффективно.

Для использования декоратора необходимо передать целевое действие или фетчер, а также объект опций, который содержит схему валидации и сигнал для накопления ошибок. В случае несоответствия схемы валидации, декоратор блокирует выполнение операции и записывает соответствующие ошибки в указанный сигнал.
