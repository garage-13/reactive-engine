# Персистентность состояния в `localStorage` и кросс-вкладочная синхронизация

Пользовательские настройки (выбранная тема оформления, язык интерфейса, состояние боковой панели, черновики фильтров) должны переживать перезагрузку страницы и мгновенно синхронизироваться между всеми открытыми вкладками одного приложения.

В **`@pravosleva/reactive-engine` v3.0.x** этот паттерн реализуется без сторонних плагинов с помощью комбинации `signal`, `effect` и нативного браузерного события `window.addEventListener('storage', ...)`:

1. **Гидратация при старте (SSR-safe):** При создании сигнала сервис безопасно читает и валидирует JSON из `localStorage` (с проверкой `typeof window !== 'undefined'`, чтобы код не падал при рендеринге на сервере).
2. **Автосохранение через `effect`:** Любое изменение сигнала автоматически сериализуется в `localStorage` в рамках стандартной микрозадачи планировщика.
3. **Защита от бесконечного цикла при синхронизации вкладок:** Событие `'storage'` срабатывает только в **соседних** вкладках браузера (не в той, которая сделала запись). Кроме того, внутренний флаг `isSyncingFromStorage` гарантирует, что обновление сигнала из соседней вкладки не спровоцирует повторную перезапись в `localStorage`.

## Практический пример: Сервис пользовательских настроек (`PreferencesService.ts`)

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
  locale: 'ru',
  sidebarCollapsed: false,
}

export class PreferencesService extends AbstractService {
  // Флаг защиты от повторной записи при получении данных из соседней вкладки
  private isSyncingFromStorage = false

  // Инициализируем сигнал начальным значением из localStorage
  public preferences = this.engine.signal<UserPreferences>(
    this.readFromStorage(),
    'prefs:state'
  )

  // Автоматически сохраняем изменения в localStorage при любой мутации сигнала
  private stopPersistEffect = this.engine.effect(() => {
    const current = this.preferences.value
    if (this.isSyncingFromStorage || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
      // Игнорируем QuotaExceededError или блокировку storage в режиме инкогнито
    }
  }, 'prefs:persistEffect')

  // Обработчик изменений из других открытых вкладок браузера
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

  // Подписываемся на событие storage как поле класса
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
   * Безопасно парсит и валидирует JSON из хранилища, подставляя дефолты
   * для повреждённых или отсутствующих полей.
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
        // Игнорируем ограничения доступа к storage
      }
    }
  }

  public dispose() {
    this.stopPersistEffect()
    this.storageListenerCleanup()
  }
}
```

### Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { PreferencesService } from './PreferencesService.js'

const engine = new ReactiveEngine()
const prefs = engine.inject(PreferencesService)

// Реактивно применяем тему оформления при изменении в текущей или соседней вкладке
engine.effect(() => {
  const { theme, locale } = prefs.preferences.value
  document.documentElement.dataset.theme = theme
  document.documentElement.lang = locale
})

// Переключение темы в текущей вкладке:
// 1. Обновит DOM в текущей вкладке
// 2. Запишет JSON в localStorage
// 3. Мгновенно пробудит событие 'storage' во всех соседних вкладках браузера
prefs.setTheme('dark')
```

## Рекомендации для продакшена

* **Версионируйте ключи хранилища (`:v1`, `:v2`):** При изменении структуры интерфейса `UserPreferences` в новых релизах обновляйте суффикс `STORAGE_KEY`. Это защитит приложение от конфликтов со старым форматом данных, застрявшим в браузерах пользователей.
* **Используйте `BroadcastChannel` для синхронизации без записи на диск:** Если нужно синхронизировать между вкладками эфемерные события (например, сигнал «пользователь вышел из аккаунта» или «закрыть модальное окно во всех окнах») без засорения `localStorage`, создайте внутри сервиса экземпляр `new BroadcastChannel('app:auth_sync')` и закрывайте его через `channel.close()` в `dispose()`.
* **Будьте осторожны с `engine.reactive()` при персистентности:** Для простых объектов настроек, которые целиком сериализуются через `JSON.stringify`, удобнее использовать обычный `engine.signal<UserPreferences>()` с иммутабельным обновлением `{ ...this.preferences.value, theme }` — так эффект сохранения срабатывает ровно один раз за изменение.
