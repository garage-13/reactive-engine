# Auto-Batching & High-Frequency Updates

In **`ReactiveEngine` v3.0.1**, automatic update batching works out of the box via the microtask queue (`queueMicrotask`). You do not need to manually wrap consecutive state mutations in transactions — the engine automatically coalesces all synchronous writes within the current tick into a single graph pass.

## How It Works Under the Hood

1. **Immediate `computed` consistency:** When a signal is updated, dependent `computed` nodes are immediately marked as stale (`DIRTY`). Reading `computed.value` on the very next line lazily re-evaluates it and returns the up-to-date result.
2. **Deferred `effect` execution:** Side effects (`effect`) and UI bindings do not fire on every intermediate mutation. Instead, they are scheduled and executed **exactly once** at the microtask boundary (`queueMicrotask`), observing only the final settled state of all signals.
3. **O(1) cursor tracking on re-evaluation:** Powered by `depsCursor` and intrusive `NodeLink` edges, even if an `effect` or `computed` subscribes to thousands of signals, dependency verification runs in **O(1)** time with zero heap allocations.

## Practical Example: Updating Multiple Filters or Table Cells

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// Create a set of signals (e.g., search filters or grid cells)
const search = engine.signal('', 'filter:search')
const category = engine.signal('all', 'filter:category')
const page = engine.signal(1, 'filter:page')

const querySummary = engine.computed(
  () => `q="${search.value}" | cat=${category.value} | page=${page.value}`,
  'filter:summary'
)

let effectRuns = 0
engine.effect(() => {
  effectRuns++
  console.log(`[Render #${effectRuns}]`, querySummary.value)
})
// Initial run: [Render #1] q="" | cat=all | page=1

// Mutate three signals in a single synchronous block without manual batch()
function resetAndSearch(newQuery: string) {
  search.value = newQuery
  category.value = 'electronics'
  page.value = 1

  // Computed values are already consistent on synchronous reads:
  console.log('Sync read:', querySummary.value)
}

resetAndSearch('laptop')
// At the microtask boundary, the effect fires EXACTLY ONCE:
// [Render #2] q="laptop" | cat=electronics | page=1
```

## When to Use Explicit `engine.batch()`

Calling `engine.batch(fn)` manually is only necessary in two specific scenarios:

* **Synchronous effect flushing:** When you need downstream effects to execute synchronously right as `batch()` exits, rather than waiting for the end of the current microtask.
* **Using the low-level `ReactiveEngineCore`:** The bare core class (without the auto-batching layer) flushes effects synchronously on every signal write, so `core.batch()` is used there to group mutations.
