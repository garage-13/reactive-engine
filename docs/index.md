---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: Reactive Engine
  text: Логическое ядро проекта
  tagline: Предсказуемый и быстрый граф реактивных вычислений
  actions:
    - theme: brand
      text: React
      link: /guides/quick-start/react
    - theme: alt
      text: Описание
      link: /guides
    - theme: alt
      text: Декраторы
      link: /decorators
    - theme: alt
      text: Хуки
      link: /react/hooks
    - theme: alt
      text: Примеры и сущности
      link: /examples

features:
  - title: Минимум ререндеров
    details: Компоненты подписываются не на «весь объект состояния», а строго на конкретные примитивные сигналы (`Signal`) или вычисляемые свойства (`Computed`), которые они выводят на экран. Изменение одного сигнала обновляет *только* тот компонент, который его читает
  - title: O(1) вычисления
    details: Computed свойства ленивы. Они не пересчитываются, пока не изменятся исходные сигналы
  - title: Автоматический Batching
    details: Движок умеет собирать множественные изменения сигналов в «пакеты» через микрозадачи. Сетевые ресурсы или тяжелые эффекты не будут перезапускаться 10 раз подряд при обновлении 10 сигналов в одном цикле
  - title: Умная асинхронность
    details: Инструмент `resource` из коробки оркеструет `AbortController`, автоматически отменяя предыдущие зависшие сетевые запросы при изменении зависимостей
---
