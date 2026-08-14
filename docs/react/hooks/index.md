---
layout: doc
---

# Хуки реактивности для работы с React

Здесь собраны все хуки для интеграции логического ядра `@pravosleva/reactive-engine` с React. Поддерживают React 18+ и ленивые фабрики без утечек памяти.

- [`engine.use`](/react/hooks/use) Хук для использования реактивного значения в React компоненте
- [useReactiveValue](/react/hooks/useReactiveValue) Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента (полная альтернатива `engine.use`)
- [useReactiveSubscription](/react/hooks/useReactiveSubscription) Универсальный хук для подписки на изменения Signal, Computed или Resource

::: tip Небольшое пояснение
* **`engine.use(signal)`** / **`useReactiveValue(signal)`** — Подписывает компонент на изменения и **принудительно перерисовывает UI** (`triggerRef`), возвращая свежее значение в JSX-шаблон.
* **`useReactiveSubscription(signal, callback)`** — Пассивно слушает изменения элемента. При срабатывании тика выполняется исключительно ваш изолированный `callback`. Компонент React при этом **НЕ заходит на повторный рендер**, что обеспечивает колоссальный буст производительности для фоновых операций.
:::
