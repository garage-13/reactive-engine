---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: Reactive Engine
  text: Логическое ядро проекта
  tagline: Предсказуемый и быстрый граф реактивных вычислений
  image:
    src: /rocket-thruster-animated-120x120.svg
    alt: Reactive Engine Logo
  actions:
    - theme: sponsor
      text: Читать большой обзор
      link: https://pravosleva.pro/p/reactive-engine-ru/
    - theme: brand
      text: React 18+
      link: /react
    - theme: brand
      text: Vue 3.2+
      link: /vue
    - theme: brand
      text: Angular 16+
      link: /angular
    - theme: alt
      text: Описание
      link: /guides
    - theme: alt
      text: Методы
      link: /methods
    - theme: alt
      text: Декораторы
      link: /decorators
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
