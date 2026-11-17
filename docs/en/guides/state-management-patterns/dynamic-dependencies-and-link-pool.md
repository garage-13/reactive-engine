# Dynamic Dependencies & Link Reuse (`LinkPool`)

Unlike systems built around a static dependency topology, **`@pravosleva/reactive-engine` v3.0.1** tracks dependencies dynamically at runtime. Whenever a conditional branch (`if / else` or ternary expression) switches inside a `computed` or `effect`, the graph automatically rewires itself to match the active execution path.

## How It Works Under the Hood (GC-Free)

When switching execution branches, the engine achieves both **zero redundant computations** and **minimal Garbage Collector (GC) pressure**:

1. **Automatic unsubscription from inactive branches:** Signals that are no longer read in the new branch are immediately detached from the consumer node. Subsequent writes to those inactive signals will never wake up the `computed` or `effect`.
2. **Object pooling via `LinkPool`:** In **v3.0.1**, detached `NodeLink` edges are not discarded onto the heap for garbage collection. Instead, they are reset and returned to a static `LinkPool`, ready to be reused on the next subscription.
3. **O(1) cursor fast path (`depsCursor`):** Common dependencies read before the branch point (such as the condition flag itself) remain intact and are verified via `depsCursor` in **O(1)** time without relinking.

## Practical Example: Switching Between Draft and Published Modes

Consider a document editor where in draft mode (`isDraftMode = true`), the displayed content comes from a high-frequency local auto-save buffer, whereas in view mode it comes from the published server snapshot.

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'

const engine = new ReactiveEngine()

// Branch condition signal
const isDraftMode = engine.signal(true, 'editor:isDraftMode')

// Sources for two separate execution branches
const localDraftText = engine.signal('Draft content...', 'editor:localDraft')
const publishedServerText = engine.signal('Published article', 'editor:published')

let computeCount = 0

// Dynamic computed: subscribes strictly to the active branch
const displayContent = engine.computed(() => {
  computeCount++
  return isDraftMode.value ? localDraftText.value : publishedServerText.value
}, 'editor:displayContent')

engine.effect(() => {
  console.log(`[View #${computeCount}]:`, displayContent.value)
})
// Initial output: [View #1]: Draft content...

// 1. User types in the draft -> effect triggers
localDraftText.value = 'Draft content (revision 1)...'
// Output: [View #2]: Draft content (revision 1)...

// 2. Switch mode to Published
// The edge to localDraftText is recycled into LinkPool; an edge to publishedServerText is acquired
isDraftMode.value = false
// Output: [View #3]: Published article

// 3. Background auto-save keeps writing to the draft, but displayContent is already unsubscribed!
localDraftText.value = 'Background auto-save tick...'
// Silence! Neither computed nor effect spends a single CPU cycle (computeCount remains 3).
```

::: tip Optimizing Read Order Inside `computed`
Read stable control flags (such as `isDraftMode.value`) **at the very top** of your `computed` or `effect` callback before any `if / else` branches. This ensures `depsCursor` always hits the **O(1)** fast path for shared dependencies and only rewires the trailing tail after the branch point.
:::
