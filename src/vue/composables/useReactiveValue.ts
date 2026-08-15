import { shallowRef, onUnmounted, getCurrentInstance, getCurrentScope, onScopeDispose, triggerRef, type ShallowRef } from 'vue'

type CleanupFn = () => void
interface ReactiveItem<T> {
  value: T
  subscribe: (cb: (v: T) => void) => CleanupFn
}

/**
 * Хук-композибл для бесшовной интеграции примитивов реактивного ядра с системой рендеринга Vue 3.
 * Нативно поддерживает как атомарные сигналы (`signal`), так и ленивые вычисляемые свойства (`computed`).
 *
 * @template T Тип данных, содержащихся внутри реактивного элемента.
 *
 * @param {Object} item Реактивный примитив ядра, на который необходимо подписаться.
 * @param {T} item.value Текущее значение элемента.
 * @param {(cb: (v: T) => void) => () => void} item.subscribe Метод ядра для оформления подписки на изменения.
 *
 * @returns {ShallowRef<T>} Возвращает стандартную для Vue 3 переменную типа `ShallowRef`.
 * При мутации данных в ядре автоматически вызывается `triggerRef`, инициируя точечный перерасчет шаблона.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useEngine } from '~/composables/useEngine';
 * import { useReactiveValue } from '@pravosleva/reactive-engine/vue';
 *
 * const engine = useEngine();
 * const counterSignal = engine.signal(0, 'ui:counter');
 *
 * // countState теперь обычный Vue Ref, но связанный с ядром данных
 * const countState = useReactiveValue(counterSignal);
 * </script>
 *
 * <template>
 *   <button @click="counterSignal.value++">Кликнули: {{ countState }}</button>
 * </template>
 * ```
 *
 * @abstract
 * ### 🚨 Поведение в SSR и Универсальном рендеринге (Nuxt 3 / Nitro)
 * Композибл полностью безопасен для работы на стороне сервера (Node.js). Благодаря внутренним
 * проверкам окружения, на этапе серверного пре-рендеринга он переходит в **пассивный режим**:
 * - Выполняется только однократное чтение `.value` для сборки начального HTML-кода страницы.
 * - Активные подписки и замыкания **не регистрируются**, что полностью предотвращает утечки памяти на сервере.
 * - Исключает появление ошибок несовпадения разметки (`Hydration Mismatch`) при гидратации в браузере.
 *
 * ### 🧹 Управление памятью на клиенте
 * В браузере композибл самостоятельно управляет своим жизненным циклом:
 * - Если вызван внутри компонента, подписка автоматически аннулируется на хуке `onUnmounted`.
 * - Если вызван внутри независимого контекста эффектов, отписка произойдет через `onScopeDispose`.
 */
export function useReactiveValue<T>(item: ReactiveItem<T>): ShallowRef<T> {
  const state = shallowRef(item.value)

  // SSR: Если мы на сервере Node.js (нет window) или вне контекста Vue —
  // просто возвращаем пассивный ref, не создавая подписку!
  const isServer = typeof window === 'undefined' || (typeof process !== 'undefined' && process.server)
  const hasInstance = getCurrentInstance() || getCurrentScope()

  if (isServer || !hasInstance) {
    return state // Пассивный режим однократного чтения для HTML-рендеринга
  }

  const unsubscribe = item.subscribe((newValue) => {
    state.value = newValue
    triggerRef(state)
  })

  if (getCurrentInstance()) {
    onUnmounted(unsubscribe)
  } else if (getCurrentScope()) {
    onScopeDispose(unsubscribe)
  }

  return state
}
