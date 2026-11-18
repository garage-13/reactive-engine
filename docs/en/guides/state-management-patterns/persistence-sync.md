# State Persistence in `localStorage` & Cross-Tab Synchronization

User preferences (selected UI theme, interface language, sidebar collapse state, filter drafts) should survive page reloads and synchronize instantaneously across all open browser tabs of the same application.

In **`@pravosleva/reactive-engine` v3.0.1**, this pattern is implemented without external plugins by combining `signal`, `effect`, and the native browser `window.addEventListener('storage', ...)` event:

1. **SSR-safe hydration on startup:** When creating the signal, the service safely reads and validates JSON from `localStorage` (guarding with `typeof window !== 'undefined'` so server-side rendering never throws).
2. **Automatic persistence via `effect`:** Any change to the signal is automatically serialized to `localStorage` inside a standard scheduler microtask.
3. **Infinite-loop protection across tabs:** The `'storage'` event fires strictly in **sibling** browser tabs (never in the tab that initiated the write). Additionally, an internal `isSyncingFromStorage` flag guarantees that updating the signal from another tab never triggers a redundant write back to `localStorage`.

---

## Practical Example: User Preferences Service (`PreferencesService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export type ThemeMode = 'light' | 'dark' | 'system'
export type LocaleCode = 'ru' | 'en'

export interface UserPreferences {
  theme: ThemeMode
  locale: LocaleCode
  sidebarCollapsed: boolean
}

const STORAGE_KEY = 'app:user_preferences:v1'

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  locale: 'en',
  sidebarCollapsed: false,
}

export class PreferencesService extends AbstractService {
  // Guard flag to prevent redundant writes when applying updates from a sibling tab
  private isSyncingFromStorage = false

  // Hydrate initial signal state from localStorage
  public preferences = this.engine.signal<UserPreferences>(
    this.readFromStorage(),
    'prefs:state'
  )

  // Automatically persist changes to localStorage whenever the signal updates
  private stopPersistEffect = this.engine.effect(() => {
    const current = this.preferences.value
    if (this.isSyncingFromStorage || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
      // Ignore QuotaExceededError or restricted storage in private browsing modes
    }
  }, 'prefs:persistEffect')

  // Handle storage mutations originating from other open browser tabs
  private handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return

    this.isSyncingFromStorage = true
    try {
      this.preferences.value = event.newValue
        ? this.parsePreferences(event.newValue)
        : DEFAULT_PREFERENCES
    } finally {
      this.isSyncingFromStorage = false
    }
  }

  // Attach the storage listener as a class field
  private storageListenerCleanup = this.attachStorageListener()

    private attachStorageListener(): () => void {
    if (typeof window === 'undefined') return () => {}

    window.addEventListener('storage', this.handleStorageEvent)
    return () => {
      window.removeEventListener('storage', this.handleStorageEvent)
    }
  }

  private readFromStorage(): UserPreferences {
    if (typeof window === 'undefined') {
      return DEFAULT_PREFERENCES
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return raw ? this.parsePreferences(raw) : DEFAULT_PREFERENCES
    } catch {
      return DEFAULT_PREFERENCES
    }
  }

  /**
   * Safely parses and validates JSON from storage, falling back to defaults
   * for corrupted or missing fields.
   */
  private parsePreferences(raw: string): UserPreferences {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) {
        return DEFAULT_PREFERENCES
      }

      const candidate = parsed as Record<string, unknown>

      const theme: ThemeMode =
        candidate.theme === 'light' ||
        candidate.theme === 'dark' ||
        candidate.theme === 'system'
          ? candidate.theme
          : DEFAULT_PREFERENCES.theme

      const locale: LocaleCode =
        candidate.locale === 'ru' || candidate.locale === 'en'
          ? candidate.locale
          : DEFAULT_PREFERENCES.locale

      const sidebarCollapsed =
        typeof candidate.sidebarCollapsed === 'boolean'
          ? candidate.sidebarCollapsed
          : DEFAULT_PREFERENCES.sidebarCollapsed

      return { theme, locale, sidebarCollapsed }
    } catch {
      return DEFAULT_PREFERENCES
    }
  }

  public setTheme(theme: ThemeMode) {
    this.preferences.value = { ...this.preferences.value, theme }
  }

  public setLocale(locale: LocaleCode) {
    this.preferences.value = { ...this.preferences.value, locale }
  }

  public toggleSidebar() {
    const prev = this.preferences.value
    this.preferences.value = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed }
  }

  public resetToDefaults() {
    this.preferences.value = DEFAULT_PREFERENCES
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore storage access restrictions
      }
    }
  }

  public dispose() {
    this.stopPersistEffect()
    this.storageListenerCleanup()
  }
}
```

### Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { PreferencesService } from './PreferencesService.js'

const engine = new ReactiveEngine()
const prefs = engine.inject(PreferencesService)

// Reactively apply UI theme whenever updated in the current or a sibling tab
engine.effect(() => {
  const { theme, locale } = prefs.preferences.value
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = locale
})

// Switching the theme in the active tab:
// 1. Updates the DOM in the current tab
// 2. Writes serialized JSON to localStorage
// 3. Immediately fires the 'storage' event in all sibling browser tabs
prefs.setTheme('dark')
```

## Production Best Practices

* **Version your storage keys (`:v1`, `:v2`):** Whenever the shape of `UserPreferences` changes across releases, bump the `STORAGE_KEY` suffix. This prevents runtime conflicts with legacy payloads cached in user browsers.
* **Use `BroadcastChannel` for disk-free cross-tab events:** When you need to broadcast ephemeral events across tabs (such as "user logged out" or "close modal everywhere") without polluting `localStorage`, instantiate `new BroadcastChannel('app:auth_sync')` inside the service and close it via `channel.close()` in `dispose()`.
* **Prefer `engine.signal()` over `engine.reactive()` for persisted settings:** For flat preference objects that are serialized as a whole via `JSON.stringify`, using a standard `engine.signal<UserPreferences>()` with immutable updates (`{ ...this.preferences.value, theme }`) ensures the persistence effect fires cleanly once per update.
