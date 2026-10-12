# ReactiveEngine Core Framework

<div align="center">

![ReactiveEngine Logo](public/rocket-thruster-animated-120x120.svg)

A lightweight, ultra-performance, type-safe reactive engine built with TypeScript, featuring Dependency Injection and seamless multi-framework integration.

</div>

---

## Documentation & Instructions
- 🇬🇧 [In English](https://pravosleva.pro/reactive-engine/en)
- 🇷🇺 [Вводная документация на Русском](https://pravosleva.pro/reactive-engine)

## What Problems This Library Solves

When building large-scale frontend applications, developers constantly run into architectural bottlenecks imposed by built-in state tools. `@pravosleva/reactive-engine` is designed to elegantly solve the following pain points:

### 1. Unnecessary Over-Rendering
* **The Problem:** React Context API and traditional immutability-based stores (Redux/Zustand) force all components reading from that state slice to re-render whenever even a single deeply nested property changes.
* **The Solution:** Fine-grained reactivity. Components micro-subscribe only to the specific primitive signals they display. State mutations update strictly the necessary DOM nodes.

### 2. UI Tearing and Lags in React 18+
* **The Problem:** Under React Concurrent Mode, standard external state managers can lead to UI tearing, where different parts of the screen temporarily display asynchronous, mismatching data.
* **The Solution:** The `useReactiveValue` hook is built on top of native `useSyncExternalStore`. This ensures absolute cross-component synchronization, shielding your interface from glitches and tearing.

### 3. Expensive CPU Re-calculations
* **The Problem:** Heavy array filtration, sorting, or data analytics functions trigger re-evaluations on every parent re-render or whenever unrelated props shift.
* **The Solution:** Lazy `Computed` properties with O(1) computation caching. The logic evaluates *only* when its underlying dependency signals change.

### 4. Network Request Flooding (Race Conditions)
* **The Problem:** A user rapidly clicking through catalog filters or pagination options spawns cascades of overlapping network requests. An older, slower request might resolve *after* a newer one, overwriting fresh data (Race Condition).
* **The Solution:** The `Resource` utility automatically orchestrates native `AbortController` instances. Whenever dependency signals change, the previous pending fetch request is instantly cancelled at the browser's system level.

### 5. Cascading UI Updates (Render Cascades)
* **The Problem:** Updating 3–4 connected state parameters inside a single event handler prompts 3–4 sequential UI update ticks, clogging the Event Loop.
* **The Solution:** 100% out-of-the-box automatic batching. The engine bundles all consecutive synchronous and asynchronous modifications into a single microtask, triggering exactly 1 final unified re-render.

### 6. Memory Leaks in Dynamic Architectures
* **The Problem:** Dynamically instantiating computed properties (e.g., dynamically filtering an active tab) accumulates abandoned reactive effects in memory that continue to listen to global state updates forever.
* **The Solution:** Built-in memory cleanup and computation memoization inside the core engine. The library hooks automatically trigger `.destroy()` on component unmount, seamlessly purging dead reactive effects from RAM.

---

## Installation

Install the package via your favorite package manager:

```bash
yarn add @pravosleva/reactive-engine
```

### `peerDependencies`

```json
{
  "@angular/core": ">=16.0.0",
  "react": "^18.0.0 || ^19.2.0",
  "react-dom": "^18.0.0 || ^19.2.0",
  "vue": ">=3.2.0"
}
```

---

## Multi-Framework Usage Examples

<div>
<details>
<summary>React 18+ Integration (Click to expand)</summary>

```tsx
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/react'

class Logic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'example-01:signal:counter');

  public inc = () => {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()

export const Example001 = () => {
  const logic = engine.inject(Logic)
  const counter = engine.use(logic.counter)

  return (
    <div>
      <div>Signal example</div>
      <code>{counter}</code>
      <div>
        <button onClick={logic.inc}>+ INC</button>
      </div>
    </div>
  )
}
```

</details>
</div>

<div>
<details>
<summary>Vue 3 Integration (Click to expand)</summary>

```vue
<script setup lang="ts">
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/vue'

class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'vue-example:counter');

  public inc = () => {
    this.counter.value += 1
  }
}

const engine = new ReactiveEngine()
const logic = engine.inject(CounterLogic)
const counter = engine.use(logic.counter)
</script>

<template>
  <div>
    <div>Vue 3 Signal Example</div>
    <code>{{ counter }}</code>
    <div>
      <button @click="logic.inc">
        + INC
      </button>
    </div>
  </div>
</template>
```

</details>
</div>

<div>
<details>
<summary>Angular 16+ Integration (Click to expand)</summary>

```ts
import { Component } from '@angular/core'
import { AbstractService } from '@pravosleva/reactive-engine'
import { ReactiveEngine } from '@pravosleva/reactive-engine/angular'

class CounterLogic extends AbstractService {
  public counter = this.engine.signal<number>(0, 'angular-example:counter');

  public inc = () => {
    this.counter.value += 1;
  };
}

@Component({
  selector: 'app-counter-example',
  standalone: true,
  template: `
    <div>
      <div>Angular 16+ Signal Example</div>
      <code>{{ counter() }}</code>
      <div>
        <button (click)="logic.inc()">
          + INC
        </button>
      </div>
    </div>
  `,
  styleUrls: []
})
export class AngularCounterComponent {
  private engine = new ReactiveEngine();
  public logic = this.engine.inject(CounterLogic);
  public counter = this.engine.use(this.logic.counter);
}
```

</details>
</div>


## Core Architecture: Push/Pull & Atomic Scheduling
The engine utilizes a hybrid Push/Pull topology paired with an Atomic Transaction Scheduler to guarantee glitch-free propagation, automated cleanup, and maximum runtime performance.
```
[ Mutate Signal ] ──( Synchronous Push )──> [ Mark Nodes Dirty ]
                                                   │
   ┌───────────────────────────────────────────────┘
   ▼
[ Atomic Scheduler ] ──( Microtask/Batch Flush )──> [ Trigger Effects ]
                                                           │
   ┌───────────────────────────────────────────────────────┘
   ▼
[ Lazy Pull Evaluation ] ──( Computed Derivations )──> [ Framework Bridges ]
```

• Synchronous Push (Invalidation): Mutating a signal triggers a cascade that immediately flags dependent `computed` and `effect` nodes as dirty.
• Lazy Pull (Evaluation): Values are computed only when explicitly read, using cached execution tracks.
• Atomic Batching: State changes made inside an `engine.batch` transaction are collapsed. Effects fire exactly once at the end of the batch block, avoiding intermediate cascade states and rendering glitches.

## Canonical Performance Patterns

1. State Mirroring Anti-Pattern vs. Lazy Derivations

Copying external async state directly into local mutable signals introduces synchronization traps, rendering loops, and memory overhead. The engine enforces a Zero-Copy Architecture through memoized computations.
```ts
// ❌ Mirroring Trap (Causes redundant pushes & recursion)
engine.effect(() => {
  const data = apiResource.data
  if (data) localSignal.value = data 
})

// 🟢 Canonical Pattern (Pure Lazy Derivation)
const validData = engine.computed(() => {
  return apiResource.data?.filter(item => item.isValid) ?? []
})
```

2. Segmented Micro-Inputs Pattern

To eliminate parent re-renders in deep form trees, push state subscriptions down to individual inputs. The parent controls global layouts by observing only top-level boundary states (like current step counters), while input fields mutate and observe point signals independently.

## Architecture-Grade Form Wizard (Example 254)
This enterprise-ready multi-step form implementation demonstrates absolute separation of concerns: state, cross-step validation schemas, and API fetch mechanics are completely decoupled from React.

1. Action Validation Decorators (`withValidation.ts`)
```ts
import { Signal } from '@pravosleva/reactive-engine'

export type ValidationSchema<T> = {
  [K in keyof T]?: (value: T[K], state: T) => string | true
}

export interface ValidationOptions<T> {
  schema: ValidationSchema<T>
  errorsSignal: Signal<Record<string, string>>
}

export const withValidation = <T, Args extends any[], R>(
  targetAction: (...args: Args) => R,
  options: ValidationOptions<T>
) => {
  return (currentState: T, ...args: Args): R | void => {
    const { schema, errorsSignal } = options
    const nextErrors: Record<string, string> = {}
    let hasErrors = false

    for (const key in schema) {
      const validator = schema[key]
      if (typeof validator === 'function') {
        const result = validator(currentState[key], currentState)
        if (typeof result === 'string') {
          nextErrors[key] = result
          hasErrors = true
        }
      }
    }

    errorsSignal.value = nextErrors
    if (hasErrors) return

    return targetAction(...args)
  }
}

export const withResourceValidation = <S, T>(
  fetcher: (source: S, signal: AbortSignal) => Promise<T>,
  options: ValidationOptions<S>
) => {
  return async (sourceValue: S, abortSignal: AbortSignal): Promise<T> => {
    const { schema, errorsSignal } = options
    const nextErrors: Record<string, string> = {}
    let hasErrors = false

    for (const key in schema) {
      const validator = schema[key]
      if (typeof validator === 'function') {
        const result = validator(sourceValue[key], sourceValue)
        if (typeof result === 'string') {
          nextErrors[key] = result
          hasErrors = true
        }
      }
    }

    errorsSignal.value = nextErrors
    if (hasErrors) throw new Error('Validation failed')

    return fetcher(sourceValue, abortSignal)
  }
}
```
2. Domain & Validation Service (`FormWizardLogic.ts`)
```tsx
import { AbstractService } from '@pravosleva/reactive-engine'
import { withValidation, withResourceValidation, ValidationSchema } from './withValidation'

export interface WizardState {
  step: number
  account: { email: string; phone: string }
  profile: { firstName: string; lastName: string }
}

export class ApiService {
  public async submitWizard(data: WizardState['profile']): Promise<{ success: boolean }> {
    return new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
  }
}

export class FormWizardLogic extends AbstractService {
  private api = this.engine.inject(ApiService)

  public currentStep = this.createSignal<number>(1)
  public errors = this.createSignal<Record<string, string>>({})

  public formData = this.engine.reactive<WizardState>({
    step: 1,
    account: { email: '', phone: '' },
    profile: { firstName: '', lastName: '' }
  })

  private accountSchema: ValidationSchema<WizardState['account']> = {
    email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? true : 'Invalid email pattern',
    phone: (val) => val.length >= 10 ? true : 'Phone must be at least 10 digits'
  }

  private profileSchema: ValidationSchema<WizardState['profile']> = {
    firstName: (val) => val.trim() ? true : 'First name is required',
    lastName: (val) => val.trim() ? true : 'Last name is required'
  }

  public isWizardValid = this.engine.computed<boolean>(() => {
    const { email, phone } = this.formData.account
    const { firstName, lastName } = this.formData.profile
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email) && phone.length >= 10 && !!firstName.trim() && !!lastName.trim()
  })

  private profileSource = this.engine.computed(() => this.formData.profile)

  public nextToProfileStep = () => {
    const action = withValidation(() => {
      this.currentStep.value = 2
    }, { schema: this.accountSchema, errorsSignal: this.errors })
    
    action(this.formData.account)
  }

  public submitWizardForm = this.engine.resource(
    withResourceValidation(
      async (profileData, abortSignal) => {
        return this.api.submitWizard(profileData)
      },
      { schema: this.profileSchema, errorsSignal: this.errors }
    ),
    this.profileSource
  )

  public prevStep = () => {
    this.errors.value = {}
    this.currentStep.value = 1
  }
}
```
3. Framework Representation (`Example254.tsx`)
The React tier remains completely stateless, eliminating all hook declaration chains. Prop-drilling the stable `logic` context doesn't trigger parent updates, providing maximum render insulation.
```tsx
import React from 'react'
import { ReactiveEngine, use } from '@pravosleva/reactive-engine/react'
import { FormWizardLogic } from './FormWizardLogic'

const engine = new ReactiveEngine()

export const Example254 = () => {
  const logic = engine.inject(FormWizardLogic)
  const step = use(logic.currentStep)
  const errors = use(logic.errors)
  const isFormValid = use(logic.isWizardValid)
  const submitState = use(logic.submitWizardForm)
  const form = use(logic.formData)

  return (
    <div className="wizard-container">
      {step === 1 && (
        <div className="step-pane">
          <h3>Step 1: Account Setup</h3>
          <input
            value={form.account.email}
            onChange={(e) => {
              logic.formData.account.email = e.target.value
              if (errors.email) logic.errors.value = { ...errors, email: '' }
            }}
            placeholder="Email (user@domain.com)"
          />
          {errors.email && <span className="err-label">{errors.email}</span>}

          <input
            value={form.account.phone}
            onChange={(e) => {
              logic.formData.account.phone = e.target.value.replace(/\D/g, '')
              if (errors.phone) logic.errors.value = { ...errors, phone: '' }
            }}
            placeholder="Phone (digits only)"
          />
          {errors.phone && <span className="err-label">{errors.phone}</span>}

          <button onClick={logic.nextToProfileStep}>Next</button>
        </div>
      )}

      {step === 2 && (
        <div className="step-pane">
          <h3>Step 2: Personal Profile</h3>
          <input
            value={form.profile.firstName}
            onChange={(e) => {
              logic.formData.profile.firstName = e.target.value
              if (errors.firstName) logic.errors.value = { ...errors, firstName: '' }
            }}
            placeholder="First Name"
          />
          {errors.firstName && <span className="err-label">{errors.firstName}</span>}

          <button onClick={logic.prevStep}>Back</button>
          <button onClick={() => logic.submitWizardForm.refetch()} disabled={submitState.loading}>
            {submitState.loading ? 'Submitting...' : 'Finish'}
          </button>
        </div>
      )}

      <div className="status-footer">
        <div>Validation Boundary: {isFormValid ? '🟢 Valid' : '🔴 Missing Criteria'}</div>
        {submitState.data?.success && <div className="success">Form successfully submitted!</div>}
      </div>
    </div>
  )
}
```

## Unified Framework Bridges
### Angular 16+ Integration (`src/angular/index.ts`)
Converts push/pull graph nodes synchronously into standard immutable read-only Angular Signals. Includes auto-unsubscribing lifecycle hooks tied to DestroyRef with injection safety.
```ts
const engine = new ReactiveEngine4Angular()
const searchLogic = engine.inject(SearchLogic)

// Exposed directly to Angular HTML template as search()
public search = this.engine.use(this.searchLogic.searchResource)
```
### Vue 3 Integration (`src/vue/index.ts`)
Exposes full integration with the Vue Composition API via deep proxy snapshots, supporting on-demand computed triggers and automated component scope teardowns.
