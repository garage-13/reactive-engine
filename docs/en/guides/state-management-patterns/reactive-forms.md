# Optimizing Large Reactive Forms via Proxy (`reactive`)

When working with large forms, multi-hundred-field questionnaires, or deeply nested configurations, the classic immutable approach (`{ ...prev, field: value }`) introduces heavy runtime overhead: every keystroke recreates the entire state tree and triggers cascading UI checks, leading to noticeable input lag.

In **`@pravosleva/reactive-engine` v3.0.x**, this problem is solved by **`engine.reactive()`**, which delivers granular, property-level reactivity (Fine-grained Property Tracking).

## How It Works Under the Hood

1. **Property-level subscriptions:** The Proxy wrapper intercepts reads on individual keys (`get`). If a computation or UI component only reads `form.customer.name`, it will never subscribe to `form.delivery.address` or 200 sibling fields.
2. **In-place mutations without cloning:** Direct assignment (`form.customer.name = 'John'`) mutates the value in place without allocating shallow copies, waking up strictly the `NodeLink` edges bound to the `name` key.
3. **Auto-batching on bulk updates:** When populating a form from an API response or resetting all fields at once, the engine automatically coalesces every mutation into a single microtask (`queueMicrotask`).

---

## Practical Example: Multi-Section Order Form

### 1. Form Service Definition (`OrderFormService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export class OrderFormService extends AbstractService {
  // Create a deep reactive Proxy object for the form state
  public form = this.engine.reactive(
    {
      customer: {
        name: '',
        email: '',
        phone: '',
      },
      delivery: {
        city: 'New York',
        street: '',
        comment: '',
      },
      meta: {
        agreeToTerms: false,
      },
    },
    'order:form'
  )

  // Subscribes STRICTLY to customer.name and meta.agreeToTerms.
  // Typing into street or comment will NOT re-evaluate this computed!
  public canSubmit = this.engine.computed(() => {
    return (
      this.form.customer.name.trim().length >= 2 &&
      this.form.meta.agreeToTerms === true
    )
  }, 'order:canSubmit')

  public fillFromProfile(name: string, email: string) {
    // Both mutations are coalesced into a single microtask (auto-batching)
    this.form.customer.name = name
    this.form.customer.email = email
  }
}
```

### 2. Usage in Business Logic or UI

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { OrderFormService } from './OrderFormService.js'

const engine = new ReactiveEngine()
const orderForm = engine.inject(OrderFormService)

engine.effect(() => {
  console.log('Изменилась улица доставки:', orderForm.form.delivery.street)
})

orderForm.form.customer.name = 'Алексей'

orderForm.form.delivery.street = 'Тверская, д. 1'
```

### Synchronous Validation & Cross-Field Checks with `withValidationSync`

### Async Pre-Submit Validation with `withValidationAsync` and `resource`

Wrap a network `fetcher` inside `engine.resource()` with `withValidationAsync` to validate form data right before sending an HTTP request. If validation fails, the decorator records errors into `errorsSignal` and throws `'Core validation stopper'`, preventing unnecessary network traffic.

```typescript
import {
  AbstractService,
  withValidationAsync,
  type ValidationSchema,
} from '@pravosleva/reactive-engine'

interface RegistrationPayload {
  username: string
  email: string
  age: number
}

export class RegistrationService extends AbstractService {
  public form = this.engine.reactive<RegistrationPayload>(
    {
      username: 'dan',
      email: 'dan@invalid-domain',
      age: 17,
    },
    'reg:form'
  )

  public errors = this.engine.signal<Record<string, string>>(
    {},
    'reg:validationErrors'
  )

  private submitTrigger = this.engine.signal<RegistrationPayload | null>(
    null,
    'reg:submitTrigger'
  )

  private schema: ValidationSchema<RegistrationPayload> = {
    email: (val) =>
      val.includes('@') && val.endsWith('.com')
        ? true
        : 'Only .com email domains are allowed',
    age: (val) => (val >= 18 ? true : 'Registration requires age 18+'),
  }

  private validatedSubmitFetcher = withValidationAsync(
    async (payload: RegistrationPayload, abortSignal: AbortSignal) => {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }

      return res.json()
    },
    {
      schema: this.schema,
      errorsSignal: this.errors,
    }
  )

  public submitResource = this.engine.resource(
    async (payload, abortSignal) => {
      if (!payload) return null
      return this.validatedSubmitFetcher(payload, abortSignal)
    },
    this.submitTrigger,
    {
      name: 'reg:submitResource',
      validateBeforeFetch: (payload) => payload !== null || 'Form not submitted',
    }
  )

  public submit() {
    this.submitTrigger.value = { ...this.form }
  }
}
```
