# Finite State Machines (FSM) with Signals

In complex multi-step workflows—such as checkout wizards, payment gateways, document verification, or multi-stage uploads—managing UI state through scattered boolean flags (`isLoading`, `isVerifying`, `isPaid`, `hasError`) inevitably leads to impossible states (for example, showing both a loading spinner and a payment confirmation banner simultaneously).

The **Finite State Machine (FSM)** pattern eliminates these bugs by guaranteeing that the system occupies **strictly one valid state** at any point in time, and transitions only occur in response to explicit events from permitted states.

## Why FSM + `@pravosleva/reactive-engine` Needs Zero External Libraries

1. **TypeScript Discriminated Unions:** Machine states are modeled as a strict union type discriminated by `status` and stored inside a single `this.engine.signal<PaymentState>()`. TypeScript automatically narrows context properties for every step.
2. **Deterministic event dispatcher `send(event)`:** All transitions are encapsulated inside an `AbstractService`. If a user double-clicks "Pay Now", the machine safely ignores the duplicate `START_PAYMENT` event because that transition is disallowed while in `'processing'`.
3. **Reactive entry/exit side effects (`effect`):** An `engine.effect()` observes `status` transitions, automatically launching async operations with an `AbortController` on state entry and aborting in-flight requests upon state exit (such as clicking "Cancel").

---

## Practical Example: Payment Gateway (`PaymentMachineService.ts`)

### 1. States, Events & Service Setup

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

// 1. All possible machine states (strict Discriminated Union)
export type PaymentState =
  | { status: 'idle' }
  | { status: 'validating'; amount: number }
  | { status: 'processing'; amount: number; attempt: number }
  | { status: 'succeeded'; transactionId: string; amount: number }
  | { status: 'failed'; reason: string; amount: number; attempt: number }

// 2. All valid events capable of triggering state transitions
export type PaymentEvent =
  | { type: 'START_PAYMENT'; amount: number }
  | { type: 'VALIDATION_PASSED' }
  | { type: 'VALIDATION_FAILED'; reason: string }
  | { type: 'PAYMENT_SUCCEEDED'; transactionId: string }
  | { type: 'PAYMENT_FAILED'; reason: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

export class PaymentMachineService extends AbstractService {
  // Single source of truth for the current FSM state
  public state = this.engine.signal<PaymentState>({ status: 'idle' }, 'payment:fsmState')

  // Derived computed flags for ergonomic UI bindings
  public isBusy = this.engine.computed(() => {
    const s = this.state.value.status
    return s === 'validating' || s === 'processing'
  }, 'payment:isBusy')

  public canRetry = this.engine.computed(() => {
    const current = this.state.value
    return current.status === 'failed' && current.attempt < 3
  }, 'payment:canRetry')

  private activeController: AbortController | null = null

    // Reactive effect executes side effects on state entry
  // and aborts in-flight requests upon state exit
  private stopSideEffects = this.engine.effect(() => {
    const current = this.state.value
    this.abortInFlight()

    if (current.status === 'validating') {
      const controller = new AbortController()
      this.activeController = controller
      void this.runValidation(current.amount, controller.signal)
      return
    }

    if (current.status === 'processing') {
      const controller = new AbortController()
      this.activeController = controller
      void this.runCharge(current.amount, current.attempt, controller.signal)
    }
  }, 'payment:fsmSideEffects')

  /**
   * Single entry point for transitioning the machine state.
   * Disallowed transitions for the current status are deterministically ignored.
   */
  public send(event: PaymentEvent): boolean {
    const current = this.state.value

    switch (current.status) {
      case 'idle':
        if (event.type === 'START_PAYMENT' && event.amount > 0) {
          this.state.value = { status: 'validating', amount: event.amount }
          return true
        }
        return false

      case 'validating':
        if (event.type === 'VALIDATION_PASSED') {
          this.state.value = {
            status: 'processing',
            amount: current.amount,
            attempt: 1,
          }
          return true
        }
        if (event.type === 'VALIDATION_FAILED') {
          this.state.value = {
            status: 'failed',
            reason: event.reason,
            amount: current.amount,
            attempt: 1,
          }
          return true
        }
        if (event.type === 'CANCEL') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'processing':
        if (event.type === 'PAYMENT_SUCCEEDED') {
          this.state.value = {
            status: 'succeeded',
            transactionId: event.transactionId,
            amount: current.amount,
          }
          return true
        }
        if (event.type === 'PAYMENT_FAILED') {
          this.state.value = {
            status: 'failed',
            reason: event.reason,
            amount: current.amount,
            attempt: current.attempt,
          }
          return true
        }
        if (event.type === 'CANCEL') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'failed':
        if (event.type === 'RETRY' && current.attempt < 3) {
          this.state.value = {
            status: 'processing',
            amount: current.amount,
            attempt: current.attempt + 1,
          }
          return true
        }
        if (event.type === 'RESET') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'succeeded':
        if (event.type === 'RESET') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false
    }
  }

  private async runValidation(amount: number, signal: AbortSignal) {
    try {
      const res = await fetch('/api/payments/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
        signal,
      })

      if (!res.ok) {
        this.send({ type: 'VALIDATION_FAILED', reason: 'Transaction limit exceeded' })
        return
      }

      this.send({ type: 'VALIDATION_PASSED' })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      this.send({ type: 'VALIDATION_FAILED', reason: 'Limit validation network error' })
    }
  }

  private async runCharge(amount: number, attempt: number, signal: AbortSignal) {
    try {
      const res = await fetch('/api/payments/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, attempt }),
        signal,
      })

      if (!res.ok) {
        this.send({ type: 'PAYMENT_FAILED', reason: `Gateway error (${res.status})` })
        return
      }

      const payload: unknown = await res.json()
      const txId =
        typeof payload === 'object' &&
        payload !== null &&
        'transactionId' in payload &&
        typeof payload.transactionId === 'string'
          ? payload.transactionId
          : 'tx_unknown'

      this.send({ type: 'PAYMENT_SUCCEEDED', transactionId: txId })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      this.send({ type: 'PAYMENT_FAILED', reason: 'Network error while charging card' })
    }
  }

  private abortInFlight() {
    if (this.activeController) {
      this.activeController.abort()
      this.activeController = null
    }
  }

  public dispose() {
    this.stopSideEffects()
    this.abortInFlight()
  }
}
```

### 2. Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { PaymentMachineService } from './PaymentMachineService.js'

const engine = new ReactiveEngine()
const payment = engine.inject(PaymentMachineService)

// Observe machine state transitions: TypeScript narrows context properties per case
engine.effect(() => {
  const current = payment.state.value

  switch (current.status) {
    case 'idle':
      console.log('Waiting for payment amount')
      break
    case 'validating':
      console.log(`Validating transaction limits for ${current.amount}...`)
      break
    case 'processing':
      console.log(`Charging ${current.amount} (attempt #${current.attempt})...`)
      break
    case 'succeeded':
      console.log(`Payment succeeded! Transaction ID: ${current.transactionId}`)
      break
    case 'failed':
      console.warn(`Error: ${current.reason}. Retry available: ${payment.canRetry.value}`)
      break
  }
})

// 1. Start the payment flow
payment.send({ type: 'START_PAYMENT', amount: 4990 })

// 2. Duplicate clicks while processing are safely ignored (returns false)
payment.send({ type: 'START_PAYMENT', amount: 4990 })

// 3. The user can cancel mid-flight during validation or charging:
// the active fetch is immediately cancelled via AbortController
// payment.send({ type: 'CANCEL' })
```

## FSM Design Best Practices

* **Co-locate context inside union variants instead of separate signals:** Properties like `transactionId` only make sense in `'succeeded'`, while `reason` only applies to `'failed'`. Keeping them inside a single `signal<PaymentState>` prevents stale context fields across transitions.
* **Use exhaustive `switch (current.status)` without `default`:** In TypeScript, an exhaustive `switch` over the discriminant ensures at compile time that adding a new status forces you to handle every valid transition.
* **Integrating external state machine libraries (e.g., XState v5):** If your project already uses XState, encapsulate `createActor(machine)` inside an `AbstractService` and mirror snapshots via `actor.subscribe((snapshot) => { this.snapshotSignal.value = snapshot })` so downstream `computed` and `effect` nodes react seamlessly.
