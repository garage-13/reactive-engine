# Socket.IO v4+ Integration (Typed Events, Ack & Connection State Recovery)

Unlike raw browser `WebSocket`, **Socket.IO v4+** handles namespace multiplexing, rooms, automatic reconnection, packet buffering during disconnects, and delivery **Acknowledgements**.

When integrating Socket.IO into a **`@pravosleva/reactive-engine` v3.0.1** service, follow modern Socket.IO v4 best practices:

1. **Strict event contracts (`Socket<ServerToClientEvents, ClientToServerEvents>`):** Define all incoming and outgoing events using TypeScript interfaces without `any`.
2. **Dynamic `auth` callback (`auth: (cb) => cb({ token })`):** Instead of passing a static object at initialization time, read the auth token from a reactive signal on every initial connection and automatic reconnect.
3. **Promise-based acknowledgements (`emitWithAck`):** Use `socket.timeout(5000).emitWithAck(...)` instead of legacy nested callbacks.
4. **Checking `socket.recovered`:** Leverage Connection State Recovery so the service knows whether missed packets were automatically replayed by the server or if history must be re-fetched via `resource.refresh()`.

## Practical Example: Typed Chat & Presence (`ChatSocketService.ts`)

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

// 1. Strict contract for server-to-client events
interface ServerToClientEvents {
  'message:new': (msg: ChatMessage) => void
  'room:onlineCount': (payload: { roomId: string; count: number }) => void
}

// 2. Strict contract for client-to-server events (with Ack support)
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
  // Reactive auth and active room parameters
  public authToken = this.engine.signal<string | null>(null, 'sio:authToken')
  public activeRoomId = this.engine.signal<string | null>('general', 'sio:activeRoom')

  // Reactive connection and data state
  public isConnected = this.engine.signal(false, 'sio:isConnected')
  public isRecovered = this.engine.signal(false, 'sio:isRecovered')
  public onlineCount = this.engine.signal(0, 'sio:onlineCount')
  public messages = this.engine.signal<ChatMessage[]>([], 'sio:messages')

  private socket: TypedChatSocket | null = null

    // Reactive lifecycle controller: connects the socket only when an auth token is present
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

  // Reactive room controller: re-subscribes whenever activeRoomId changes
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
      // Dynamic auth callback (Socket.IO v4 standard):
      // reads the latest token on every initial connect and automatic reconnect
      auth: (cb) => {
        cb({ token: this.authToken.value })
      },
    })

    socket.on('connect', () => {
      this.isConnected.value = true
      // Check Connection State Recovery flag (Socket.IO v4.6+):
      // if false, session state was not restored and we must explicitly rejoin the room
      this.isRecovered.value = socket.recovered

      if (!socket.recovered && this.activeRoomId.value) {
        void this.joinRoom(this.activeRoomId.value)
      }
    })

    socket.on('disconnect', () => {
      this.isConnected.value = false
    })

    socket.on('message:new', (msg) => {
      // Filter incoming frames for the currently active room
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
   * Joins the target room on the server and awaits an acknowledgement within 5 seconds.
   *
   * @param roomId Room identifier read from `this.activeRoomId.value`.
   */
  private async joinRoom(roomId: string) {
    if (!this.socket?.connected) return

    try {
      const ack = await this.socket.timeout(5000).emitWithAck('room:join', roomId)
      if (!ack.ok) {
        console.warn(`Failed to join room ${roomId}:`, ack.error)
      }
    } catch {
      console.warn(`Acknowledgement timed out while joining room ${roomId}`)
    }
  }

  /**
   * Sends a message to the active room and resolves with the server-confirmed payload.
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
      throw new Error(ack.error || 'Server rejected the message')
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

### Usage in Vanilla JS or UI Layer

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { ChatSocketService } from './ChatSocketService.js'

const engine = new ReactiveEngine()
const chat = engine.inject(ChatSocketService)

// Observe connection state, online user count, and incoming messages
engine.effect(() => {
  console.log(
    `[Socket.IO] connected=${chat.isConnected.value} | recovered=${chat.isRecovered.value} | online=${chat.onlineCount.value}`
  )
})

engine.effect(() => {
  console.log('Messages in room:', chat.messages.value.length)
})

// 1. Setting the auth token automatically triggers io().connect() with fresh credentials
chat.authToken.value = 'Bearer eyJhbGciOiJIUzI1Ni...'

// 2. Switching rooms automatically dispatches room:join via emitWithAck
chat.activeRoomId.value = 'engineering'

// 3. Send a message and await server confirmation (5-second timeout)
await chat.sendMessage('Hello, team!')

// 4. Clean up on logout or module unmount
// chat.authToken.value = null
// chat.dispose()
```

## Production Best Practices (Socket.IO v4+)

* **Use `autoConnect: false` with a dynamic `auth` callback:** Passing `auth: { token: signal.value }` as a static object during `io()` initialization causes automatic reconnects to replay an expired JWT. Using `auth: (cb) => cb({ token: this.authToken.value })` ensures the freshest token is read on every reconnection attempt.
* **Handle `socket.recovered` for hybrid sync:** In Socket.IO v4.6+, Connection State Recovery automatically replays missed packets after brief disconnects (`socket.recovered === true`). For longer outages (`socket.recovered === false`), bind a history-fetching `engine.resource` to this flag so missed messages are restored cleanly.
* **Call `socket.removeAllListeners()` before `disconnect()`:** Explicitly stripping listeners inside `teardownSocket()` prevents closure leaks when a user logs in and out multiple times during a single SPA session.
