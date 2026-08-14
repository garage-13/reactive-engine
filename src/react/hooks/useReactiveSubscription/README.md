# 🪝 Хук `useReactiveSubscription`

Универсальный хук React для организации **сайд-эффектов**, реагирующих на изменения элементов реактивного графа (`Signal`, `Computed` или `Resource`) без принудительного рендеринга самого компонента.

## 🛠️ Примеры использования

### 1. Фоновое логирование аналитики (Интеграция с `Computed`)

Представьте сценарий: пользователь водит мышкой внутри зоны, сырые координаты троттлятся на этапе вычислений с помощью `withThrottleComputed`. Вам нужно отправлять данные в Яндекс.Метрику или Google Analytics при смене сектора экрана, но сам компонент React не должен перерисовываться ради фонового логирования.

#### Код сервиса (`store.ts`)
```typescript
import { AbstractService, withThrottleComputed } from '@pravosleva/reactive-engine';

export class AnalyticsService extends AbstractService {
  public rawCoords = this.engine.signal({ x: 0, y: 0 }, 'analytics:coords:raw');

  // Закомпутенный сигнал, определяющий текущую рабочую зону
  public currentSector = withThrottleComputed(
    this.engine,
    () => (this.rawCoords.value.x < 300 ? 'Левый сектор' : 'Правый сектор'),
    { limit: 500 },
    'analytics:computed:sector'
  );

  public updateMouse(x: number, y: number) {
    this.rawCoords.value = { x, y };
  }
}
```

#### Код компонента React
```tsx
import { useEffect } from 'react';
import { ReactiveEngine, useReactiveSubscription } from '@pravosleva/reactive-engine/react';
import { AnalyticsService } from './store';

const engine = new ReactiveEngine({ logger: { isEnabled: true } });

export const AnalyticsTracker = () => {
  const service = engine.inject(AnalyticsService);

  // NOTE: ПАССИВНАЯ ПОДПИСКА НА COMPUTED:
  // При смене сектора (раз в 500мс) сработает этот коллбэк.
  // Компонент AnalyticsTracker выполнит отправку на сервер,
  // но сам НЕ зайдет на повторный рендер! UI остается максимально легким.
  useReactiveSubscription(service.currentSector, (sector) => {
    console.log(`[GA] Отправка аналитики: Пользователь перешел в ${sector}`);
    // fakeApi.sendMetrics({ target: sector });
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    service.updateMouse(e.clientX, e.clientY);
  };

  return (
    <div onMouseMove={handleMouseMove}>
      <span>Зона отслеживания движений (Двигайте мышь)</span>
    </div>
  );
};
```

### 2. Всплывающие уведомления (Интеграция с `Resource`)

Сценарий: в приложении выполняется асинхронный запрос на загрузку профиля чата или отправку сообщения. Нам необходимо отловить момент сбоя сети (`error`) или успешного завершения операции (`data`), чтобы показать пользователю всплывающий тост (Toast/Notification). Использование обычного `useEffect` привело бы к рассинхронизации фаз из-за асинхронного характера сети, а `useReactiveSubscription` отработает синхронно на финише микрозадачи.

#### Код сервиса (`chat.service.ts`)
```ts
import { AbstractService } from '@pravosleva/reactive-engine';

export class ChatService extends AbstractService {
  public activeChatId = this.engine.signal<string | null>(null, 'chat:id');

  // Асинхронный ресурс загрузки сообщений
  public messagesResource = this.engine.resource(
    async (chatId) => {
      if (!chatId) return [];
      const response = await fetch(`/api/chats/${chatId}/messages`);
      if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
      return response.json();
    },
    this.activeChatId,
    'chat:resource:messages'
  );

  public selectChat(id: string) {
    this.activeChatId.value = id;
  }
}
```

#### Код компонента React
```tsx
import { ReactiveEngine, useReactiveSubscription } from '@pravosleva/reactive-engine/react';
import { ChatService } from './chat.service';
import { toast } from 'your-favorite-toast-library'; // Фейковая библиотека тостов

const engine = new ReactiveEngine({ logger: { isEnabled: true } });

export const ChatNotificationsBridge = () => {
  const chatService = engine.inject(ChatService);

  // NOTE: СИНХРOННАЯ ПОДПИСКА НА СОСТОЯНИЕ РЕСУРСА (API STATE):
  // Коллбэк получает объект ResourceState { data, loading, error, isRetrying }
  // в тот самый миг, когда автомат состояний ресурса переходит в новую фазу.
  useReactiveSubscription(chatService.messagesResource, (state) => {
    // А. Перехватываем статус ошибки сети
    if (state.error) {
      toast.error(`Не удалось загрузить сообщения: ${state.error.message}`);
    }

    // Б. Перехватываем успешное завершение асинхронной операции
    if (!state.loading && state.data && (state.data as any[]).length > 0) {
      toast.success(`Чат успешно обновлен! Загружено сообщений: ${(state.data as any[]).length}`);
    }
  });

  return (
    <div>
      <button onClick={() => chatService.selectChat('room-42')}>
        Открыть комнату №42
      </button>
      <button onClick={() => chatService.selectChat('corrupted-room-999')}>
        Открыть сломанную комнату
      </button>
    </div>
  );
};
```

## 💎 Главные архитектурные преимущества

1. **Гарантия отсутствия Tearing (Защита `useLayoutEffect`):** Внутренний механизм хука завязан на синхронный жизненный цикл до отрисовки кадров. Это гарантирует, что даже если данные из WebSocket или сети прилетят в микросекундный промежуток между рендером и Paint-фазой, ваш коллбэк **не пропустит ни одного асинхронного тика**.
2. **Мгновенный Unmount в StrictMode:** В режиме разработки React StrictMode намеренно монтирует и размонтирует компоненты за долю секунды. Наш хук мгновенно вызывает деструктор отписки ядра, полностью исключая накопление паразитных «зомби-эффектов» и утечки оперативной памяти.
3. **Безупречное логирование:** В логах `ReactiveEngine` при срабатывании коллбэка этот подписчик отобразится под понятным системным именем фреймворка: `react:use:your-signal-name`, делая дерево реактивного графа прозрачным для анализа.
