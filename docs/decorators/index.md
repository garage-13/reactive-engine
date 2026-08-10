---
layout: home

hero:
  title: "🚀 Декораторы реактивности"
  tagline: "Здесь собраны все декораторы логического ядра @pravosleva/reactive-engine. Выберите нужный для перехода к руководству."

features:
  - icon: 📦
    title: withCache
    details: Утилита кэширования (декоратор) перехватывает вызовы fetcher. Он проверяет наличие данных в памяти и следит за тем, чтобы они не устарели по времени.
    link: /decorators/withCache
  - icon: ⏳
    title: withDebounce
    details: Группирует частые вызовы функции и откладывает их выполнение на заданное время. Идеально для инпутов поиска.
    link: /decorators/withDebounce
  - icon: ⏳
    title: withThrottle
    details: Применяется в сценариях с высокой частотой генерации событий, когда нам важен непрерывный процесс изменений в динамике, но с жестким ограничением максимальной частоты вызовов.
    link: /decorators/withThrottle
  - icon: ⏳
    title: withThrottleComputed
    details: Применяется в сценариях с высокой частотой генерации событий, когда нам важен непрерывный процесс изменений в динамике, но с жестким ограничением максимальной частоты вызовов.
    link: /decorators/withThrottleComputed
  - icon: ⏳
    title: withThrottleAndCache
    details: Комбинированный продвинутый инструмент оптимизации (декоратор), который применяется в сценариях с высокой частотой генерации событий, когда запрашиваемые данные при этом могут повторяться или дублироваться.
    link: /decorators/withThrottleAndCache
  - icon: 🔄
    title: withLongPolling
    details: Автоматически организует периодические запросы к серверу для обновления ресурсов в реальном времени.
    link: /decorators/withLongPolling
---
