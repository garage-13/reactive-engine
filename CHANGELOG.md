# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://xn--keepachangelog-kw34b.com),
and this project adheres to [Semantic Versioning](https://semver.org).

---

## [1.5.8-beta] - 2026-08-17

### Добавлено
* **Enterprise-уровень документации асинхронных декораторов (JSDoc)**
  * Добавлены исчерпывающие и структурированные JSDoc-комментарии на русском языке для всей линейки оптимизирующих декораторов: `withThrottleComputed`, `withThrottleAndCache`, `withThrottle`, `withLongPolling`, `withDebounce` и `withCache`.
  * В описания интегрированы наглядные практические примеры (`@example`) по связыванию декораторов с подсистемой ресурсов ядра `engine.resource`.
  * Документированы важные архитектурные особенности управления памятью, каскадного отклонения промисов через `AbortError` и правила гигиены подписок (`removeEventListener`).
  * Добавлены специализированные разделы предупреждений по безопасности использования замыканий кэша в средах серверного рендеринга (SSR / Next.js / Nuxt 3) для предотвращения кросс-пользовательских утечек данных.
  * Описаны паттерны тестирования декораторов с использованием ложных таймеров (`Fake Timers` в Vitest/Jest) благодаря их полной совместимости с нативным `Date.now()`.

## [1.5.6-beta] - 2026-08-15

### Добавлено
* **Официальный Vue 3 Composable: `useReactiveValue`**
  * В подпакет `@pravosleva/reactive-engine/vue` добавлен каноничный композибл `useReactiveValue` для интеграции сигналов и `computed`-свойств ядра с Composition API.
  * Реализована встроенная рантайм-защита на базе `getCurrentInstance()` и `getCurrentScope()`. На этапе серверного пре-рендеринга (SSR / Nuxt 3 / Nitro) композибл работает в безопасном пассивном режиме однократного чтения, полностью исключая утечки памяти в Node.js и предотвращая появление ошибок `Hydration Mismatch`.
  * Добавлено автоматическое управление жизненным циклом подписок, гарантирующее самоочистку слушателей при размонтировании компонента или уничтожении контекста `EffectScope` в браузере.

### Изменено
* **Унификация и оптимизация DX подпакета `/vue`**
  * Архитектура Vue-адаптера переведена на Multi-Pattern API: теперь точка входа `src/vue/index.ts` экспортирует как объектно-ориентированный класс `ReactiveEngine4Vue` с методом `.use()`, так и новый функциональный композибл `useReactiveValue`.
  * Обеспечена полная синтаксическая симметрия между React и Vue подписками, что снижает ментальную нагрузку на разработчиков при кроссплатформенной разработке.

## [1.5.5-beta] - 2026-08-14

### Добавлено
* **Патч ядра: Управление видимостью сервисных логов оптимизации**
  * В интерфейс настроек логгера `EngineLoggerOptions` добавлено управляющее поле `isCoreOptimizationDebugEnabled?: boolean` (по умолчанию `false`), позволяющее гибко переключаться между лаконичным и глубоким режимами отладки.
  * Реализована двухслойная система ранней фильтрации в методе `log()`, мгновенно отсекающая служебный инфраструктурный шум из бандлов `REACTIVE TRANSACTION` без лишних затрат на регулярные выражения, если режим глубокой отладки выключен.

### Изменено
* **Рефакторинг и инкапсуляция системных маркеров ядра**
  * Внутренний сервисный эффект синхронизации `computed`-свойств переименован с использованием строгого системного префикса `[CORE_INTERNAL_EFFECT=1]:${name}`.
  * Логика раннего выхода логгера полностью переведена на утилиту `getExtractedValues` для точечной детекции как внутренних сигналов кэша (`[CORE_INTERNAL_SIGNAL=1]`), так и обновленных внутренних эффектов (`[CORE_INTERNAL_EFFECT=1]`).
  * Пользовательский маркер `[IS_OPTIMIZED=1]` полностью декуплирован от кода ядра и переведен в статус прикладного декларативного тега (Optimization Tag). Он служит явным указанием для рантайм-линтера отключать оранжевые предупреждения `⚠️ high noise` и блокировать генерацию `__performance_advice__` подсказок там, где высокая частота обновлений запланирована разработчиком по дизайну.

## [1.5.4-beta] - 2026-08-13

### Добавлено
* **Патч ядра: Расширение конфигурации `EngineLoggerOptions` полем `instanceName`**
  * В интерфейс настроек логгера `EngineLoggerOptions` добавлено необязательное строковое поле `instanceName` для явной идентификации конкретного экземпляра движка.
  * Группировщик транзакций `flushLogs` модернизирован: теперь имя инстанса динамически выводится в заголовке `console.groupCollapsed` (например, `REACTIVE TRANSACTION your-instance-name Microtask Tick`).
  * Обеспечена кристально чистая изоляция и трассировка логов в мульти-инстансных архитектурах, сложных распределенных системах и микрофронтендах (Microfrontends), позволяющая мгновенно определять суверенный шедулер-источник текущей микрозадачи.

## [1.5.3-beta] - 2026-08-13

### Добавлено
* **Патч ядра: Полное логирование и трассировка эффектов (`effect`)**
  * Внедрена нативная интеграция метода `engine.effect` в глобальную систему батчинга логов `REACTIVE TRANSACTION`.
  * Добавлен замер производительности выполнения эффектов через `performance.now()` с выводом точного хронометража (`duration`) в консоль DevTools.
  * Реализован автоматический инкремент счетчика боевых вызовов эффекта (`🚀 Вызовов: N`) с выводом предупреждения `heavy re-renders` в случае обнаружения циклического дребезга или спама значений (более 30 вызовов за такт).
  * В метод `this.log()` добавлен бэдж `🟩 EFFECT` для сквозного визуального аудита реактивного графа.
  * Флаг `isFirstRun` инкапсулирован в замыкание метода `effect` для изоляции контекста `this` и бесшумной блокировки холостых «стартовых» логов при сборке первичных зависимостей.

### Исправлено
* **Устранение RegExp-ловушки фильтрации во `flushLogs`**
  * Исправлен системный контракт передачи аргументов в `engine.queueLog` внутри метода `effect`. Имя эффекта теперь строго мапится в свойство `name`, что гарантирует стопроцентное прохождение лога через регулярные выражения фильтра логгера (`loggerOptions.filter`).
  * Устранено аварийное падение (Silent Exception) функции `console.groupCollapsed` из-за отсутствия предопределенного CSS-стиля для типа `'effect'` в справочнике `badgeColors`.

## [1.5.1-beta] - 2026-08-11

### Added
- **Property-level advice for `signal`**: Integrated an intelligent runtime performance linter inside `log()` method. If a signal detects a mutation frequency of over 50 ticks per microtask thread, it evaluates current listeners using `getExtractedValues()`. If any unoptimized UI element is bound without specific protection metadata, it automatically injects a tailored `__performance_advice__` payload with ready-to-copy solutions directly into the expanded console group.
- **Metadata Tagging via `withThrottleComputed`**: Added `[IS_OPTIMIZED=1]` string-embedded metadata label to the internal scheduler effect of the decorator to guarantee seamless integration with the automated telemetry core.

### Fixed
- **Logger-induced Vue 3 evaluation freeze**: Replaced unsafe `JSON.stringify(currentDetail.to)` operations with clean execution typeguards (`typeof rawValue === 'object'`). This safeguards lazy reactivity paths (Pull model) against accidental premature execution of hidden JavaScript core getters during the log processing phase.

---

## [1.4.3-beta] - 2026-08-10

### Added
- **`withThrottleComputed` Decorator**: Engineered a specialized, synchronous, highly optimized reactive stream decorator for throttling heavy cascade computations (`engine.computed`). Crucial for compressing hyper-frequent upstream inputs (such as cursor tracking `onMouseMove`, window scroll, or input debouncing) down to discrete intervals before values propagate deeper into components.
- **Dynamic Cascade Batching Scheduler**: Replaced static snapshot arrays (`Array.from`) with a live `for...of` dynamic iteration loop inside the `queueMicrotask` scheduler thread. Now, cascade updates that spawn mid-execution safely inject themselves into the running microtask, executing exactly once and preventing microtask fragmentation (`Size: 1` logs split).

### Fixed
- **Memory Leak in Core Signal Subscriptions**: Eliminated recursive closure accumulation within the `get value()` getter. By wrapping double-sided reference indexing in a strict `if (!subscribers.has(currentEffect))` block, memory allocations are locked to exactly one function per lifecycle event, resolving cache inflation during continuous data streams.
- **Vitest Environment FakeTimers Desync**: Stabilized asynchronous clock mocking for complex reactive graphs inside Node.js test-runner runtime environments. Replaced unstable custom wrappers with deterministic `await vi.advanceTimersByTimeAsync()` loops.

---

## [1.4.1-beta] - 2026-08-08

### Added
- **Core Microtask Logger Subsystem**: Designed and integrated a feature-rich, high-density transactional engine profiler operated natively on microtask boundaries (`queueMicrotask`).
- **Atomic Transaction Cluster Log Layout**: Aggregated multiple individual signal, resource, and computational mutations under a unified, collapsed header (`console.groupCollapsed`). The Master-group instantly visualizes key indicators: total mutation count inside current microtask tick (`Size`), pure filter/calculation duration (`Transaction Duration`), and a real-time relative performance trend metric calculated as a delta against the previous execution tick (`🟢 stable`, `🟢 -32.1%`, `🔴 +14.5%`).
- **Metadata Extraction Infrastructure (`getExtractedValues`)**: Built a robust utility parsing tool using lazy capture groups (`(?<value>.*?)`) to extract configurations embedded straight inside reactive strings (e.g., `[CORE_INTERNAL_SIGNAL=1]`). This decouples core business logic from brittle `startsWith()` prefixes.
- **Context-Aware Cross-Platform Subscriber Labels**: Introduced polymorphic framework tracking identifiers (`frameworkPrefix`). The telemetry console automatically mirrors the active UI integration architecture: `` `react:use:${name}` ``, `` `vue:use:${name}` ``, or `` `angular:use:${name}` ``.
- **Asynchronous `Resource` Phase Telemetry**: Configured high-visibility color logging styles for the `Resource` machine state. Network events are automatically categorized into live visual stages: `⏳ FETCHING (loading: true)`, `🟢 SUCCESS (data)`, and `🔴 ERROR`.

### Changed
- **`computed` Architecture Alignment**: Refactored the core calculation method to respect native lazy execution standards (Pull-model). The engine effectively monitors dependency invalidation structures (`isDirty`), allowing individual frameworks to query fresh evaluation frames on demand via the adapter bridge.
- **`resource` Core Modernization**: Migrated the internal network state engine to utilize the newly deployed metadata structure (`[CORE_INTERNAL_SIGNAL=1]:resource:state:`). This hides noise from standard dashboards while retaining detailed tracking underneath data structures.
- **Cross-Platform Bridge Security Upgrades**: Updated the underlying engine connection handlers for Vue 3 and Angular 16+ integration layers. Component adapters now enforce synchronous `.value` inspection inside their core callback subscriptions, eliminating the lazy caching "freeze" vulnerability during parent component mount phases.

---

### Legend / Guideline for additions:
- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.
