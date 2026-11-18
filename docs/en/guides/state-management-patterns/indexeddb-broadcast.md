# Persistence in IndexedDB & Cross-Tab Sync via `BroadcastChannel`

When an application needs to store large amounts of client-side data—such as offline document drafts, multi-megabyte lookup caches, message history, or binary attachments (`Blob` / `ArrayBuffer`)—`localStorage` falls short due to its 5 MB quota and blocking synchronous API.

Combining **IndexedDB** with **`BroadcastChannel`** solves both problems cleanly:

1. **Non-blocking asynchronous reads and writes in IndexedDB:** Keeps the main rendering thread responsive and stores structured objects natively without manual string serialization.
2. **Instant cross-tab notifications via `BroadcastChannel`:** Unlike `localStorage`, IndexedDB does not emit a built-in `'storage'` event across sibling tabs. After every database write, the originating tab broadcasts a lightweight notification over `BroadcastChannel`, prompting sibling tabs to re-read fresh data via `engine.resource()`.
3. **Revision-based race protection:** Incrementing a local `syncRevision` signal ensures concurrent reads always settle on the latest database state.

---

## Practical Example: Offline Drafts Storage (`DraftsDbService.ts`)

### 1. Service Setup & `BroadcastChannel` Listener

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export interface DocumentDraft {
  id: string
  title: string
  content: string
  updatedAt: number
}

interface SyncBroadcastMessage {
  type: 'DRAFTS_UPDATED'
  senderId: string
  draftId: string
}

const DB_NAME = 'app_offline_db_v1'
const STORE_NAME = 'drafts'
const CHANNEL_NAME = 'app:drafts_sync'

export class DraftsDbService extends AbstractService {
  // Unique identifier for the current tab to ignore self-originated broadcasts
  private readonly tabId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab_${Math.random().toString(36).slice(2)}`

  // Revision trigger signal: incrementing forces the resource to re-read from IndexedDB
  private syncRevision = this.engine.signal(0, 'drafts:syncRevision')

  private dbPromise: Promise<IDBDatabase> | null = null
  private channel: BroadcastChannel | null = this.initBroadcastChannel()

  // Automatically loads drafts on startup and whenever a sibling tab notifies an update
  public draftsResource = this.engine.resource<DocumentDraft[], number>(
    async () => this.getAllFromDb(),
    this.syncRevision,
    'drafts:listResource'
  )

  private initBroadcastChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return null
    }

    const bc = new BroadcastChannel(CHANNEL_NAME)
    bc.onmessage = (event: MessageEvent<unknown>) => {
      if (!this.isSyncMessage(event.data)) return
      if (event.data.senderId === this.tabId) return

      // A sibling tab updated IndexedDB -> bump revision to re-fetch fresh records
      this.syncRevision.value += 1
    }
    return bc
  }

    private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in the current environment'))
        return
      }

      const request = indexedDB.open(DB_NAME, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    })

    return this.dbPromise
  }

  private async getAllFromDb(): Promise<DocumentDraft[]> {
    const db = await this.openDb()

    return new Promise<DocumentDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        const items = Array.isArray(request.result)
          ? (request.result as DocumentDraft[])
          : []
        // Sort drafts by last modified timestamp (newest first)
        resolve(items.sort((a, b) => b.updatedAt - a.updatedAt))
      }
      request.onerror = () => reject(request.error ?? new Error('Failed to read from IndexedDB'))
    })
  }

  /**
   * Inserts or updates a draft in IndexedDB, refreshes the current tab,
   * and notifies all sibling browser tabs via BroadcastChannel.
   */
  public async saveDraft(draft: Omit<DocumentDraft, 'updatedAt'>): Promise<void> {
    const db = await this.openDb()
    const record: DocumentDraft = {
      ...draft,
      updatedAt: Date.now(),
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(record)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to write to IndexedDB'))
    })

    // Refresh list in the current tab and broadcast to sibling tabs
    this.syncRevision.value += 1
    this.notifyOtherTabs(record.id)
  }

  public async deleteDraft(draftId: string): Promise<void> {
    const db = await this.openDb()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(draftId)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete from IndexedDB'))
    })

    this.syncRevision.value += 1
    this.notifyOtherTabs(draftId)
  }

  private notifyOtherTabs(draftId: string) {
    if (!this.channel) return

    const message: SyncBroadcastMessage = {
      type: 'DRAFTS_UPDATED',
      senderId: this.tabId,
      draftId,
    }
    this.channel.postMessage(message)
  }

  private isSyncMessage(data: unknown): data is SyncBroadcastMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'DRAFTS_UPDATED' &&
      'senderId' in data &&
      typeof data.senderId === 'string' &&
      'draftId' in data &&
      typeof data.draftId === 'string'
    )
  }

  public async dispose() {
    this.draftsResource.abort()

    if (this.channel) {
      this.channel.close()
      this.channel = null
    }

    if (this.dbPromise) {
      const db = await this.dbPromise.catch(() => null)
      db?.close()
      this.dbPromise = null
    }
  }
}
```

### 2. Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { DraftsDbService } from './DraftsDbService.js'

const engine = new ReactiveEngine()
const draftsService = engine.inject(DraftsDbService)

// Subscribe to the drafts list (updates automatically when modified in any tab)
engine.effect(() => {
  const { loading, data, error } = draftsService.draftsResource.value

  if (loading && !data) {
    console.log('Reading drafts from IndexedDB...')
    return
  }

  if (error) {
    console.error('Storage error:', error.message)
    return
  }

  if (data) {
    console.log('Up-to-date offline drafts:', data)
  }
})

// Save a draft:
// 1. Writes the record to IndexedDB inside a readwrite transaction
// 2. Updates draftsResource in the active tab
// 3. Broadcasts a sync event over BroadcastChannel to all sibling tabs
await draftsService.saveDraft({
  id: 'draft-101',
  title: 'Reactive Engine Architecture',
  content: 'Article draft stored locally...',
})

// Close the database connection and BroadcastChannel on module unmount
// await draftsService.dispose()
```

## Production Best Practices

* **Broadcast lightweight metadata instead of raw payloads:** Avoid sending multi-megabyte documents through `channel.postMessage(...)`, as that duplicates memory via Structured Clone. Broadcast only a compact notification (`{ type: 'DRAFTS_UPDATED', draftId }`) and let sibling tabs read the fresh slice directly from IndexedDB.
* **Filter self-originated messages by `tabId`:** Although native `BroadcastChannel` does not echo messages back to the sender window, explicitly checking `senderId === this.tabId` protects against duplicate triggers when using custom wrappers or polyfills.
* **Handle schema upgrade blocking (`onversionchange`):** If two tabs are open and one loads a newer app release that bumps the database version (`indexedDB.open(DB_NAME, 2)`), the older tab can block the upgrade transaction. Attach `db.onversionchange = () => db.close()` inside `openDb()` so legacy tabs release their connection gracefully.
