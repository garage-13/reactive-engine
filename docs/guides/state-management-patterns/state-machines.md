# Конечные автоматы (State Machines / FSM) на сигналах

В сложных многошаговых процессах — таких как оформление заказа, платёжный шлюз, верификация документов или загрузка файлов — управление интерфейсом через набор разрозненных булевых флагов (`isLoading`, `isVerifying`, `isPaid`, `hasError`) рано или поздно приводит к «невозможным состояниям» (например, когда одновременно активны спиннер загрузки и сообщение об успешной оплате).

Паттерн **конечного автомата (Finite State Machine, FSM)** решает эту проблему, гарантируя, что система в любой момент времени находится **ровно в одном допустимом состоянии**, а переход в следующее состояние возможен только по явному событию и только из разрешённого исходного состояния.

## Почему связка FSM + `@pravosleva/reactive-engine` работает без лишних библиотек

1. **Дискриминирующие объединения TypeScript (Discriminated Unions):** Состояние машины описывается строгим объединением типов с полем-дискриминатором `status` и хранится в одном реактивном сигнале `this.engine.signal<PaymentState>()`. TypeScript автоматически сужает доступные поля контекста для каждого шага.
2. **Детерминированный диспетчер событий `send(event)`:** Все переходы инкапсулированы внутри `AbstractService`. Если пользователь дважды нажмёт «Оплатить», автомат проигнорирует повторное событие `SUBMIT`, так как переход из состояния `'processing'` по событию `SUBMIT` запрещён.
3. **Реактивные эффекты входа в состояние (`onEntry`):** Подписка через `this.engine.effect()` отслеживает смену `status` и автоматически запускает асинхронную операцию (с передачей `AbortController`), а при уходе из состояния (например, при нажатии «Отмена») прерывает текущий запрос.

---

## Практический пример: Платёжный шлюз (`PaymentMachineService.ts`)

### 1. Описание состояний, событий и сервиса

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

// 1. Все возможные состояния автомата (строгий Discriminated Union)
export type PaymentState =
  | { status: 'idle' }
  | { status: 'validating'; amount: number }
  | { status: 'processing'; amount: number; attempt: number }
  | { status: 'succeeded'; transactionId: string; amount: number }
  | { status: 'failed'; reason: string; amount: number; attempt: number }

// 2. Все допустимые события, способные перевести автомат в другое состояние
export type PaymentEvent =
  | { type: 'START_PAYMENT'; amount: number }
  | { type: 'VALIDATION_PASSED' }
  | { type: 'VALIDATION_FAILED'; reason: string }
  | { type: 'PAYMENT_SUCCEEDED'; transactionId: string }
  | { type: 'PAYMENT_FAILED'; reason: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

export class PaymentMachineService extends AbstractService {
  // Единый источник истины — текущее состояние конечного автомата
  public state = this.engine.signal<PaymentState>({ status: 'idle' }, 'payment:fsmState')

  // Производные вычисляемые флаги для удобной привязки UI
  public isBusy = this.engine.computed(() => {
    const s = this.state.value.status
    return s === 'validating' || s === 'processing'
  }, 'payment:isBusy')

  public canRetry = this.engine.computed(() => {
    const current = this.state.value
    return current.status === 'failed' && current.attempt < 3
  }, 'payment:canRetry')

  private activeController: AbortController | null = null

    // Реактивный эффект выполняет побочные действия при входе в состояние
  // и отменяет незавершённые запросы при выходе из него
  private stopSideEffects = this.engine.effect(() => {
    const current = this.state.value
    this.abortInFlight()

    if (current.status === 'validating') {
      const controller = new AbortController()
      this.activeController = controller
      void this.runValidation(current.amount, controller.signal)
      return
    }

    if (current.status === 'processing') {
      const controller = new AbortController()
      this.activeController = controller
      void this.runCharge(current.amount, current.attempt, controller.signal)
    }
  }, 'payment:fsmSideEffects')

  /**
   * Единственная точка входа для смены состояния автомата.
   * Недопустимые переходы для текущего статуса игнорируются детерминированно.
   */
  public send(event: PaymentEvent): boolean {
    const current = this.state.value

    switch (current.status) {
      case 'idle':
        if (event.type === 'START_PAYMENT' && event.amount > 0) {
          this.state.value = { status: 'validating', amount: event.amount }
          return true
        }
        return false

      case 'validating':
        if (event.type === 'VALIDATION_PASSED') {
          this.state.value = {
            status: 'processing',
            amount: current.amount,
            attempt: 1,
          }
          return true
        }
        if (event.type === 'VALIDATION_FAILED') {
          this.state.value = {
            status: 'failed',
            reason: event.reason,
            amount: current.amount,
            attempt: 1,
          }
          return true
        }
        if (event.type === 'CANCEL') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'processing':
        if (event.type === 'PAYMENT_SUCCEEDED') {
          this.state.value = {
            status: 'succeeded',
            transactionId: event.transactionId,
            amount: current.amount,
          }
          return true
        }
        if (event.type === 'PAYMENT_FAILED') {
          this.state.value = {
            status: 'failed',
            reason: event.reason,
            amount: current.amount,
            attempt: current.attempt,
          }
          return true
        }
        if (event.type === 'CANCEL') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'failed':
        if (event.type === 'RETRY' && current.attempt < 3) {
          this.state.value = {
            status: 'processing',
            amount: current.amount,
            attempt: current.attempt + 1,
          }
          return true
        }
        if (event.type === 'RESET') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false

      case 'succeeded':
        if (event.type === 'RESET') {
          this.state.value = { status: 'idle' }
          return true
        }
        return false
    }
  }

  private async runValidation(amount: number, signal: AbortSignal) {
    try {
      const res = await fetch('/api/payments/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
        signal,
      })

      if (!res.ok) {
        this.send({ type: 'VALIDATION_FAILED', reason: 'Лимит операции превышен' })
        return
      }

      this.send({ type: 'VALIDATION_PASSED' })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      this.send({ type: 'VALIDATION_FAILED', reason: 'Ошибка проверки лимитов' })
    }
  }

  private async runCharge(amount: number, attempt: number, signal: AbortSignal) {
    try {
      const res = await fetch('/api/payments/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, attempt }),
        signal,
      })

      if (!res.ok) {
        this.send({ type: 'PAYMENT_FAILED', reason: `Ошибка шлюза (${res.status})` })
        return
      }

      const payload: unknown = await res.json()
      const txId =
        typeof payload === 'object' &&
        payload !== null &&
        'transactionId' in payload &&
        typeof payload.transactionId === 'string'
          ? payload.transactionId
          : 'tx_unknown'

      this.send({ type: 'PAYMENT_SUCCEEDED', transactionId: txId })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      this.send({ type: 'PAYMENT_FAILED', reason: 'Сетевой сбой при списании средств' })
    }
  }

  private abortInFlight() {
    if (this.activeController) {
      this.activeController.abort()
      this.activeController = null
    }
  }

  public dispose() {
    this.stopSideEffects()
    this.abortInFlight()
  }
}
```

### 2. Использование в чистом JS или UI-слое

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { PaymentMachineService } from './PaymentMachineService.js'

const engine = new ReactiveEngine()
const payment = engine.inject(PaymentMachineService)

// Подписываемся на смену состояний автомата: TypeScript сужает типы в каждом case
engine.effect(() => {
  const current = payment.state.value

  switch (current.status) {
    case 'idle':
      console.log('Ожидание ввода суммы')
      break
    case 'validating':
      console.log(`Проверка лимитов для суммы ${current.amount}...`)
      break
    case 'processing':
      console.log(`Списание ${current.amount} (попытка #${current.attempt})...`)
      break
    case 'succeeded':
      console.log(`Оплата прошла! ID транзакции: ${current.transactionId}`)
      break
    case 'failed':
      console.warn(`Ошибка: ${current.reason}. Повтор доступен: ${payment.canRetry.value}`)
      break
  }
})

// 1. Запускаем процесс оплаты
payment.send({ type: 'START_PAYMENT', amount: 4990 })

// 2. Повторный клик во время обработки будет безопасно проигнорирован (вернёт false)
payment.send({ type: 'START_PAYMENT', amount: 4990 })

// 3. Пользователь может прервать операцию на шаге валидации или списания:
// активный fetch мгновенно отменится через AbortController
// payment.send({ type: 'CANCEL' })
```

## Рекомендации по проектированию FSM

* **Храните контекст внутри вариантов объединения, а не в отдельных сигналах:** Поля вроде `transactionId` имеют смысл только в состоянии `'succeeded'`, а `reason` — только в `'failed'`. Объединяя их в единый `signal<PaymentState>`, вы исключаете рассинхронизацию данных при переходах.
* **Используйте `switch (current.status)` без `default` для проверки полноты:** В TypeScript исчерпывающий `switch` по полю-дискриминатору гарантирует на этапе компиляции, что при добавлении нового статуса вы не забудете обработать его в таблице переходов.
* **Интеграция со сторонними библиотеками (например, XState v5):** Если в проекте уже используется XState, вы можете инкапсулировать `createActor(machine)` внутри `AbstractService` и транслировать снимки через `actor.subscribe((snapshot) => { this.snapshotSignal.value = snapshot })`, сохраняя совместимость с остальным реактивным графом.
