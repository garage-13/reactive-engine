---
layout: home

hero:
  title: 🚀 Хуки реактивности
  tagline: Здесь собраны все хуки логического ядра @pravosleva/reactive-engine. Выберите нужный для перехода к руководству.

features:
  - icon: 📦
    title: useReactiveSubscription
    details: Универсальный хук для подписки на изменения Signal, Computed или Resource.
    link: /hooks/useReactiveSubscription
  - icon: 📦
    title: useReactiveValue
    details: Хук для извлечения значения из Signal/Computed/Resource и авто-ререндера компонента. Поддерживает React 18+ и ленивые фабрики без утечек памяти. Предположим, что counterSignal и doubleComputed созданы где-то в вашем приложении. Хук сам подпишется, вытащит значение наружу и будет триггерить ререндер компонента.
    link: /hooks/useReactiveValue
---
