# Optimistic UI Updates with Automatic Rollback

When handling frequent user interactions—such as liking a post, toggling a task status, or updating item quantities in a shopping cart—waiting for a server round-trip before updating the screen makes the interface feel sluggish.

The **Optimistic UI** pattern updates state instantaneously on user input, dispatches the network request in the background, and automatically rolls back to the original snapshot if the server fails.

## How It Works in `@pravosleva/reactive-engine`

1. **State snapshot before mutation:** Before applying the optimistic change, store the current signal value in a local constant (`previousSnapshot`).
2. **Immediate write to `signal`:** The UI re-renders synchronously in the current tick without waiting for the network.
3. **Race protection & error rollback:** The network mutation runs with an `AbortSignal` (cancelling stale in-flight requests on rapid double-clicks), while the `catch` block restores `previousSnapshot` if a network failure or HTTP `>= 400` status occurs.

---

## Practical Example: Todo Status Toggle

### 1. Service Definition (`TodosService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export interface TodoItem {
  id: string
  title: string
  completed: boolean
}

export class TodosService extends AbstractService {
  // Primary task list
  public items = this.engine.signal<TodoItem[]>(
    [
      { id: '1', title: 'Upgrade core to v3.0.1', completed: true },
      { id: '2', title: 'Write state management pattern guides', completed: false },
    ],
    'todos:items'
  )

  // Signal for the latest synchronization error (e.g., to trigger a toast alert)
  public syncError = this.engine.signal<string | null>(null, 'todos:syncError')

  // Track active AbortControllers by item ID to cancel rapid duplicate clicks
  private pendingControllers = new Map<string, AbortController>()

  public async toggleTodo(todoId: string) {
    // 1. Abort any previous in-flight request for this specific item
    this.pendingControllers.get(todoId)?.abort()
    const controller = new AbortController()
    this.pendingControllers.set(todoId, controller)

    // 2. Capture state snapshot prior to optimistic mutation
    const previousSnapshot = this.items.value
    const targetItem = previousSnapshot.find((item) => item.id === todoId)
    if (!targetItem) return

    const nextCompleted = !targetItem.completed

    // 3. Optimistically update the UI immediately and clear stale errors
    this.syncError.value = null
    this.items.value = previousSnapshot.map((item) =>
      item.id === todoId ? { ...item, completed: nextCompleted } : item
    )

    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }

      // Optionally reconcile with the canonical server response
      const updatedFromServer: TodoItem = await res.json()
      this.items.value = this.items.value.map((item) =>
        item.id === todoId ? updatedFromServer : item
      )
    } catch (err: any) {
      // Ignore aborts triggered by a newer user click
      if (err?.name === 'AbortError') return

      // 4. Roll back to the snapshot and record the error
      this.items.value = previousSnapshot
      this.syncError.value = err?.message || 'Failed to save changes'
    } finally {
      if (this.pendingControllers.get(todoId) === controller) {
        this.pendingControllers.delete(todoId)
      }
    }
  }
}
```

### 2. Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { TodosService } from './TodosService.js'

const engine = new ReactiveEngine()
const todos = engine.inject(TodosService)

// Subscribe to task list and synchronization errors
engine.effect(() => {
  console.log('Current tasks:', todos.items.value)
})

engine.effect(() => {
  if (todos.syncError.value) {
    console.error('Show toast notification:', todos.syncError.value)
  }
})

// User clicks on task #2:
// 1. UI immediately shows completed: true
// 2. If the server returns 500, task #2 reverts to completed: false,
//    and syncError receives the error message
todos.toggleTodo('2')
```

## Production Best Practices

* **Item-level rollback for concurrent mutations:** In the example above, `previousSnapshot` restores the entire `items` array. If a user toggles task `#1` and immediately toggles task `#2`, and the request for `#1` fails after `#2` has already succeeded, restoring the whole array would overwrite `#2`'s update. For concurrent list mutations, revert **only the specific target item** by its `id` (`completed: !nextCompleted`) instead of replacing the entire list.
* **Debugging with the transactional logger:** When running with `new ReactiveEngine({ logger: { isEnabled: true } })`, the console clearly displays two separate transactions: the immediate optimistic write and the subsequent rollback batch on failure.
