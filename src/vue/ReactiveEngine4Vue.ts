import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'
import { ReactiveEngine as OriginalReactiveEngine, type CleanupFn } from '../core/core'

export interface ISignalLike<V> {
  value: V;
  subscribe: (cb: (v: V) => void) => CleanupFn;
}

export class ReactiveEngine4Vue extends OriginalReactiveEngine {
  protected override frameworkPrefix = 'vue'

  /**
   * Переопределяем метод создания реактивных объектов для Vue-версии движка.
   * Безопасно внедряет скрытое свойство __subscribe в оригинальный граф без double-proxying.
   *
   * @template T
   * @param {T} target - Исходный объект/массив
   * @param {string} [name] - Имя сущности для логирования
   * @returns {T} - Строго типизированный оригинальный Proxy-объект ядра
   */
  public override reactive<T extends object>(target: T, name?: string): T {
    // Внедряем геттер __subscribe непосредственно в целевой target ДО передачи его в super.reactive()
    if (!Reflect.has(target, '__subscribe')) {
      Object.defineProperty(target, '__subscribe', {
        get: () => {
          return (cb: () => void) => {
            // Создаем честный эффект ядра на оригинальном инстансе адаптера Vue
            return this.effect(() => {
              try {
                // Вызываем глубокий прогрев Proxy-геттеров ядра core.ts на оригинальном Proxy
                JSON.stringify(originalProxy)
              } catch (e) {
                Object.values(originalProxy as Record<string, unknown>)
              }
              cb() // Пинаем триггер обновления Vue
            }, 'vue-proxy-internal-subscription')
          }
        },
        configurable: true,
        enumerable: false // Скрываем из логов и переборов, чтобы не спамить в JSON
      })
    }

    const originalProxy = super.reactive(target, name)
    return originalProxy
  }

  /**
   * Использование реактивного значения во Vue-компоненте или EffectScope.
   * Полиморфно поддерживает как атомарные Сигналы/Computed, так и глубокие реактивные Proxy-объекты.
   *
   * @template T
   * @param {T} item - Реактивный объект ядра (сигнал или прокси)
   * @returns {T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>} - Обертка ShallowRef
   */
  public use<T>(item: T): T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T> {
    // Безопасная проверка на пустые значения рантайма
    if (item === null || item === undefined || typeof item !== 'object') {
      const state = shallowRef(item)
      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
    }

    // Проверяем, реализует ли переданный объект интерфейс Сигнала (наличие метода subscribe)
    const isSignal = 'subscribe' in item && typeof (item as Record<string, unknown>).subscribe === 'function'

    // ------------------------------------------------====
    // СЦЕНАРИЙ А: Передан примитивный Сигнал или Computed
    // ------------------------------------------------====
    if (isSignal) {
      const signalItem = (item as unknown) as ISignalLike<unknown>
      const state = shallowRef(signalItem.value)

      const unsubscribe = signalItem.subscribe((newValue) => {
        state.value = newValue
        triggerRef(state)
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }

      // Честное strict-приведение к целевому условному типу дженерика
      return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
    }

    // ------------------------------------------------====
    // СЦЕНАРИЙ Б: Передан Proxy-объект из метода reactive()
    // ------------------------------------------------====
    const state = shallowRef(item)

    // Если объект создан через наш переопределенный метод reactive(), у него гарантированно будет геттер `__subscribe`
    if ('__subscribe' in item && typeof (item as Record<string, unknown>).__subscribe === 'function') {
      const unsubscribe = ((item as Record<string, unknown>).__subscribe as (cb: () => void) => CleanupFn)(() => {
        triggerRef(state) // Нативно прогоняем автобатчинг ядра прямо во Vue Реф!
      })

      if (getCurrentInstance()) {
        onUnmounted(() => unsubscribe())
      } else if (getCurrentScope()) {
        onScopeDispose(() => unsubscribe())
      }
    }

    return state as (T extends ISignalLike<infer V> ? ShallowRef<V> : ShallowRef<T>)
  }
}
