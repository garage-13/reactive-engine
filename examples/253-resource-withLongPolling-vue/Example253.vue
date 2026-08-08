<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { AbstractService, withLongPolling } from '@pravosleva/reactive-engine'
import { ReactiveEngine as ReactiveEngine4Vue } from '@pravosleva/reactive-engine/vue'
import clsx from 'clsx'

// Импортируем общие стили песочницы
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

interface TPollingData {
  status: string;
  serverTime: number;
  updates: string[];
}

// 1. Описываем изолированную бизнес-логику ядра с Long Polling
class LongPollingLogic extends AbstractService {
  // Управляющий сигнал-триггер активности опроса
  public isPollingActive = this.engine.signal<boolean>(false, 'example-203:polling:active');
  // Такт опроса для отслеживания итераций
  public pollingTick = this.engine.signal<number>(0, 'example-203:polling:tick');

  // Вычисляемая зависимость для ресурса
  private apiDeps = this.engine.computed(() => [
    this.isPollingActive.value,
    this.pollingTick.value
  ]);

  public destroy = () => {
    this.isPollingActive.value = false;
    this.pollingTick.value = 0;
  };

  // Обертка с лонг-поллингом вокруг асинхронного запроса к API
  public pollingState = this.engine.resource<TPollingData | null, [boolean, number]>(
    // Обертываем функцию-фетчер в хелпер ядра withLongPolling
    withLongPolling(
      async (deps, abortSignal) => {
        const [isActive] = deps;
        // Если опрос выключен, мгновенно прерываем выполнение, возвращая null
        if (!isActive) return null;

        const res = await fetch(
          `${BASE_API_URL}/notifications/updates?_responseDelay=1000`,
          { signal: abortSignal }
        );

        if (!res.ok) throw new Error(`HTTP polling error! status: ${res.status}`);
        return res.json();
      },
      {
        // 🌟 Оставляем ТОЛЬКО чистые задержки времени, которые поддерживает декоратор ядра
        delay: 2000,
        onNextTick: () => {
          // Увеличиваем такт только если опрос все еще активен
          this.pollingTick.value += 1;
        }
      }
    ),
    this.apiDeps,
    {
      name: 'example-203:resource:long-polling',
      resetDataOnSourceChange: true,
      validateBeforeFetch: () => this.isPollingActive.value,
      responseValidate: (res) => {
        // --- Логика остановки на основе ответа сервера ---
        // Например: бэкенд прислал статус "COMPLETED", "STOP" или пустой массив,
        // сигнализируя, что новых данных больше не будет
        if (res && res.status === 'STOP') {
          this.isPollingActive.value = false; // 🛑 Мгновенно выключаем триггер поллинга
          this.pollingTick.value = 0;         // Сбрасываем такты
          return true; // Прерываем цепочку, не переходя на следующий такт
        }

        // Если все в порядке и останавливать не нужно — переходим на следующий такт
        if (this.isPollingActive.value) {
          this.pollingTick.value += 1;
        }
        return true;
      }
    }
  );

  // Переключатель состояния опроса
  public togglePolling = () => {
    this.isPollingActive.value = !this.isPollingActive.value;
    if (!this.isPollingActive.value) {
      this.pollingTick.value = 0; // Сбрасываем такты при остановке
    }
  };
}

// 2. Инициализируем Vue-версию движка
const engine = new ReactiveEngine4Vue()
const logic = engine.inject(LongPollingLogic)

onUnmounted(() => {
  // Вызываем метод уничтожения логики при закрытии модалки
  logic.destroy();
});

// 3. Адаптируем реактивные примитивы под Composition API (возвращают ShallowRef)
const isPollingActive = engine.use(logic.isPollingActive)
const pollingTick = engine.use(logic.pollingTick)
const pollingResourceState = engine.use(logic.pollingState)

// 4. Безопасно извлекаем свойства ресурса для людей, изучающих Vue, через computed
const loading = computed(() => pollingResourceState.value?.loading)
const data = computed(() => pollingResourceState.value?.data)
const error = computed(() => pollingResourceState.value?.error)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel" title="Resource with Long Polling">
      Resource with Long Polling (Vue)
    </div>
    <code>{{ BASE_API_URL }}</code>

    <div style="min-width: 100%;">
      <button
        @click="logic.togglePolling"
        :class="clsx(
          btnClasses.btn,
          btnClasses.neonBtn,
          {
            [btnClasses['neonBtn--primary']]: !isPollingActive,
            [btnClasses['neonBtn--secondary']]: isPollingActive,
            [btnClasses['neonBtn--contained']]: isPollingActive,
            [btnClasses['neonBtn--outlined']]: !isPollingActive,
          }
        )"
      >
        {{ isPollingActive ? '🛑 Stop Polling' : '▶️ Start Long Polling' }}
      </button>
    </div>

    <!-- Индикация статуса текущей итерации запроса -->
    <div style="display: flex; gap: 8px; flex-direction: row; flex-wrap: wrap; align-items: center;">
      <span>
        Статус: {{ loading ? `🟡 запрос (Такт: ${pollingTick})...` : data ? '🟢 активен' : error ? '🔴 ошибка' : '⚪ спит' }}
      </span>
      <em v-if="error?.message" style="color: red;">{{ error.message }}</em>
    </div>

    <!-- Вывод полученных данных -->
    <pre :class="baseClasses.preNormalizedMin">{{ JSON.stringify({ data }, null, 2) }}</pre>
  </div>
</template>
