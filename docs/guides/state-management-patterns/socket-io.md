# Интеграция с Socket.IO v4+ (типизированные события, Ack и Connection State Recovery)

В отличие от низкоуровневого браузерного `WebSocket`, библиотека **Socket.IO v4+** берёт на себя мультиплексирование пространств имён (Namespaces), комнаты (Rooms), автоматический реконнект, буферизацию пакетов при разрыве связи и подтверждения доставки (**Acknowledgements**).

При интеграции Socket.IO в сервис **`@pravosleva/reactive-engine` v3.0.1** важно следовать актуальным стандартам Socket.IO v4:

1. **Строгая типизация контрактов (`Socket<ServerToClientEvents, ClientToServerEvents>`):** Все входящие и исходящие события описываются через TypeScript-интерфейсы без использования `any`.
2. **Динамический `auth`-колбэк (`auth: (cb) => cb({ token })`):** Вместо передачи статического объекта при инициализации, токен считывается из реактивного сигнала в момент каждого подключения или автоматического переподключения.
3. **Асинхронные подтверждения (`emitWithAck`):** Современный промис-ориентированный метод с таймаутом (`socket.timeout(5000).emitWithAck(...)`) заменяет устаревшие вложенные колбэки.
4. **Проверка `socket.recovered`:** При восстановлении связи (Connection State Recovery) сервис понимает, были ли пропущенные события доставлены сервером автоматически, или нужно принудительно перезагрузить состояние через `resource.refresh()`.

## Практический пример: Типизированный чат и присутствие (`ChatSocketService.ts`)

```typescript
import { io, type Socket } from 'socket.io-client'
import { AbstractService } from '@pravosleva/reactive-engine'

export interface ChatMessage {
  id: string
  roomId: string
  author: string
  text: string
  sentAt: number
}

// 1. Строгий контракт событий от сервера к клиенту
interface ServerToClientEvents {
  'message:new': (msg: ChatMessage) => void
  'room:onlineCount': (payload: { roomId: string; count: number }) => void
}

// 2. Строгий контракт событий от клиента к серверу (с поддержкой Ack)
interface ClientToServerEvents {
  'room:join': (
    roomId: string,
    ack: (response: { ok: boolean; error?: string }) => void
  ) => void
  'message:send': (
    payload: { roomId: string; text: string },
    ack: (response: { ok: boolean; message?: ChatMessage; error?: string }) => void
  ) => void
}

type TypedChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export class ChatSocketService extends AbstractService {
  // Реактивные параметры авторизации и активной комнаты
  public authToken = this.engine.signal<string | null>(null, 'sio:authToken')
  public activeRoomId = this.engine.signal<string | null>('general', 'sio:activeRoom')

  // Реактивное состояние соединения и данных
  public isConnected = this.engine.signal(false, 'sio:isConnected')
  public isRecovered = this.engine.signal(false, 'sio:isRecovered')
  public onlineCount = this.engine.signal(0, 'sio:onlineCount')
  public messages = this.engine.signal<ChatMessage[]>([], 'sio:messages')

  private socket: TypedChatSocket | null = null

    // Реактивный контроллер жизненного цикла: подключает сокет только при наличии токена
  private stopConnectionEffect = this.engine.effect(() => {
    const token = this.authToken.value

    if (!token) {
      this.teardownSocket()
      return
    }

    if (!this.socket) {
      this.initSocket()
    }

    if (this.socket && !this.socket.connected) {
      this.socket.connect()
    }
  }, 'sio:connectionEffect')

  // Реактивный контроллер активной комнаты: переподписывается при смене activeRoomId
  private stopRoomEffect = this.engine.effect(() => {
    const roomId = this.activeRoomId.value
    const connected = this.isConnected.value

    if (!connected || !roomId || !this.socket) return

    this.messages.value = []
    void this.joinRoom(roomId)
  }, 'sio:roomEffect')

  private initSocket() {
    const socket: TypedChatSocket = io('https://example.com', {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // Динамический auth-колбэк (стандарт Socket.IO v4):
      // считывает актуальный токен при каждом коннекте и автоматическом реконнекте
      auth: (cb) => {
        cb({ token: this.authToken.value })
      },
    })

    socket.on('connect', () => {
      this.isConnected.value = true
      // Проверяем флаг Connection State Recovery (Socket.IO v4.6+):
      // если false — состояние сессии не восстановилось и нужно перезайти в комнату
      this.isRecovered.value = socket.recovered

      if (!socket.recovered && this.activeRoomId.value) {
        void this.joinRoom(this.activeRoomId.value)
      }
    })

    socket.on('disconnect', () => {
      this.isConnected.value = false
    })

    socket.on('message:new', (msg) => {
      // Фильтруем пакеты только для текущей активной комнаты
      if (msg.roomId === this.activeRoomId.value) {
        this.messages.value = [...this.messages.value, msg]
      }
    })

    socket.on('room:onlineCount', ({ roomId, count }) => {
      if (roomId === this.activeRoomId.value) {
        this.onlineCount.value = count
      }
    })

    this.socket = socket
  }

  /**
   * Входит в указанную комнату на сервере с ожиданием подтверждения (Ack) до 5 секунд.
   *
   * @param roomId Идентификатор комнаты из `this.activeRoomId.value`.
   */
  private async joinRoom(roomId: string) {
    if (!this.socket?.connected) return

    try {
      const ack = await this.socket.timeout(5000).emitWithAck('room:join', roomId)
      if (!ack.ok) {
        console.warn(`Не удалось войти в комнату ${roomId}:`, ack.error)
      }
    } catch {
      console.warn(`Таймаут подтверждения входа в комнату ${roomId}`)
    }
  }

  /**
   * Отправляет сообщение в текущую комнату и возвращает подтверждённый сервером объект.
   */
  public async sendMessage(text: string): Promise<ChatMessage | null> {
    const roomId = this.activeRoomId.value
    if (!this.socket?.connected || !roomId || !text.trim()) {
      return null
    }

    const ack = await this.socket
      .timeout(5000)
      .emitWithAck('message:send', { roomId, text: text.trim() })

    if (!ack.ok || !ack.message) {
      throw new Error(ack.error || 'Сервер отклонил сообщение')
    }

    return ack.message
  }

  private teardownSocket() {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected.value = false
    this.isRecovered.value = false
  }

  public dispose() {
    this.stopConnectionEffect()
    this.stopRoomEffect()
    this.teardownSocket()
  }
}
```

### Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { ChatSocketService } from './ChatSocketService.js'

const engine = new ReactiveEngine()
const chat = engine.inject(ChatSocketService)

// Подписываемся на статус соединения, онлайн и ленту сообщений
engine.effect(() => {
  console.log(
    `[Socket.IO] connected=${chat.isConnected.value} | recovered=${chat.isRecovered.value} | online=${chat.onlineCount.value}`
  )
})

engine.effect(() => {
  console.log('Сообщения в комнате:', chat.messages.value.length)
})

// 1. Установка токена автоматически запустит io().connect() с актуальным auth
chat.authToken.value = 'Bearer eyJhbGciOiJIUzI1Ni...'

// 2. Смена комнаты автоматически вызовет room:join через emitWithAck
chat.activeRoomId.value = 'engineering'

// 3. Отправка сообщения с ожиданием подтверждения от сервера (таймаут 5с)
await chat.sendMessage('Привет, команда!')

// 4. Очистка при логауте или размонтировании модуля
// chat.authToken.value = null
// chat.dispose()
```

## Рекомендации для продакшена (Socket.IO v4+)

* **Используйте `autoConnect: false` и динамический `auth`-колбэк:** Если передать `auth: { token: signal.value }` статическим объектом при вызове `io()`, при автоматическом реконнекте после протухания JWT-токена клиент отправит старый токен. Функция `auth: (cb) => cb({ token: this.authToken.value })` гарантирует чтение свежего токена при каждой попытке переподключения.
* **Обрабатывайте `socket.recovered` для гибридной синхронизации:** В Socket.IO v4.6+ механизм Connection State Recovery восстанавливает пропущенные пакеты при кратковременных обрывах сети (`socket.recovered === true`). Если обрыв был долгим (`socket.recovered === false`), привяжите перезагрузку истории сообщений через `engine.resource` к этому флагу, чтобы не пропустить историю чата.
* **Очищайте слушатели через `socket.removeAllListeners()` перед `disconnect()`:** Внутри `teardownSocket()` явный вызов `removeAllListeners()` предотвращает утечки замыканий при многократном входе/выходе пользователя в рамках одной SPA-сессии.
