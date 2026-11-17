# Оптимизация больших реактивных форм через Proxy (`reactive`)

При работе с крупными формами, анкетами из сотен полей или глубоко вложенными конфигурациями классический иммутабельный подход (`{ ...prev, field: value }`) создаёт серьёзные накладные расходы: при каждом нажатии клавиши пересоздаётся весь объект состояния и запускается каскадная проверка UI-дерева, что приводит к задержкам ввода (input lag).

В **`@pravosleva/reactive-engine` v3.0.1** эту проблему решает метод **`engine.reactive()`**, обеспечивающий гранулярную реактивность на уровне отдельных свойств объекта (Fine-grained Property Tracking).

## Как это работает под капотом

1. **Подписка строго на прочитанные ключи:** Proxy-обёртка перехватывает обращение к конкретному свойству (`get`). Если вычисление или UI-компонент читает только `form.customer.name`, они не подписываются на `form.delivery.address` или соседние 200 полей.
2. **Точечная мутация без клонирования:** Прямое присваивание `form.customer.name = 'Иван'` обновляет значение на месте без создания копий объекта и пробуждает исключительно те узлы `NodeLink`, которые привязаны к ключу `name`.
3. **Автобатчинг при массовом заполнении:** При программном заполнении формы из ответа API или при сбросе всех полей движок автоматически объединяет все изменения в одну микрозадачу (`queueMicrotask`).

## Практический пример: Многосекционная форма заказа

### 1. Описание сервиса формы (`OrderFormService.ts`)

```typescript
import { AbstractService } from '@pravosleva/reactive-engine'

export class OrderFormService extends AbstractService {
  // Создаём глубокий реактивный Proxy-объект формы
  public form = this.engine.reactive(
    {
      customer: {
        name: '',
        email: '',
        phone: '',
      },
      delivery: {
        city: 'Москва',
        street: '',
        comment: '',
      },
      meta: {
        agreeToTerms: false,
      },
    },
    'order:form'
  )

  // Вычисление подпишется ТОЛЬКО на customer.name и meta.agreeToTerms.
  // Ввод текста в street или comment не вызовет перерасчёт этого computed!
  public canSubmit = this.engine.computed(() => {
    return (
      this.form.customer.name.trim().length >= 2 &&
      this.form.meta.agreeToTerms === true
    )
  }, 'order:canSubmit')

  public fillFromProfile(name: string, email: string) {
    // Обе мутации склеятся в одну микрозадачу (auto-batching)
    this.form.customer.name = name
    this.form.customer.email = email
  }
}
```

### 2. Использование в бизнес-логике или UI

```typescript
import { ReactiveEngine } from '@pravosleva/reactive-engine'
import { OrderFormService } from './OrderFormService.js'

const engine = new ReactiveEngine()
const orderForm = engine.inject(OrderFormService)

// Эффект следит только за конкретным полем delivery.street
engine.effect(() => {
  console.log('Изменилась улица доставки:', orderForm.form.delivery.street)
})

// 1. Ввод в поле customer.name -> эффект улицы НЕ сработает
orderForm.form.customer.name = 'Алексей'

// 2. Ввод в поле delivery.street -> сработает только эффект улицы,
// а computed canSubmit останется в покое
orderForm.form.delivery.street = 'Тверская, д. 1'
```

### Синхронная валидация и кросс-проверка полей через `withValidationSync`

Используем `withValidationSync` для защиты локального шага или сохранения черновика формы без обращения к серверу. Схема поддерживает кросс-валидацию, принимая текущее состояние вторым аргументом (`value`, `state`).

```ts
import {
  AbstractService,
  withValidationSync,
  type ValidationSchema,
} from '@pravosleva/reactive-engine'

interface CheckoutFormState {
  deliveryType: 'pickup' | 'courier'
  city: string
  street: string
  agreeToTerms: boolean
}

export class CheckoutSyncService extends AbstractService {
  // Реактивный Proxy-объект формы
  public form = this.engine.reactive<CheckoutFormState>(
    {
      deliveryType: 'courier',
      city: 'Москва',
      street: '',
      agreeToTerms: false,
    },
    'checkout:form'
  )

  // Сигнал для накопления ошибок валидации по ключам полей
  public errors = this.engine.signal<Record<string, string>>(
    {},
    'checkout:validationErrors'
  )

  // Схема с кросс-валидацией: улица обязательна только при доставке курьером
  private schema: ValidationSchema<CheckoutFormState> = {
    street: (value, state) => {
      if (state.deliveryType === 'courier' && value.trim().length < 3) {
        return 'Укажите улицу для курьерской доставки'
      }
      return true
    },
    agreeToTerms: (value) =>
      value === true ? true : 'Необходимо принять условия оферты',
  }

  // Оборачиваем целевое действие в синхронный декоратор
  private saveDraftValidated = withValidationSync(
    (draftTitle: string) => {
      console.log(`Черновик "${draftTitle}" сохранён локально:`, { ...this.form })
      return true
    },
    {
      schema: this.schema,
      errorsSignal: this.errors,
    }
  )

  // Публичный метод передает актуальный срез состояния первым аргументом
  public saveDraft(draftTitle: string) {
    return this.saveDraftValidated(this.form, draftTitle)
  }
}
```

#### Как это работает в рантайме
- При вызове `service.saveDraft('Заказ #1')` декоратор проверяет `this.form` по правилам `schema`.
- Если `deliveryType === 'courier'`, а street пустая, действие не выполнится и вернёт `undefined`, а в `service.errors.value.street` появится текст ошибки.
- Если переключить `service.form.deliveryType = 'pickup'`, кросс-валидация пропустит пустую улицу, очистит `errors` и выполнит сохранение

## Асинхронная валидация перед отправкой на сервер через `withValidationAsync` и `resource`

Используем `withValidationAsync` как обёртку над `fetcher` внутри `engine.resource()`. При невалидном состоянии формы декоратор записывает ошибки в `errorsSignal` и выбрасывает исключение `'Core validation stopper'`, предотвращая лишний сетевой запрос и переводя ресурс в состояние ошибки.

```ts
import {
  AbstractService,
  withValidationAsync,
  type ValidationSchema,
} from '@pravosleva/reactive-engine'

interface RegistrationPayload {
  username: string
  email: string
  age: number
}

export class RegistrationService extends AbstractService {
  public form = this.engine.reactive<RegistrationPayload>(
    {
      username: 'dan',
      email: 'dan@invalid-domain',
      age: 17,
    },
    'reg:form'
  )

  public errors = this.engine.signal<Record<string, string>>(
    {},
    'reg:validationErrors'
  )

  // Триггер отправки формы (хранит снимок данных для ресурса)
  private submitTrigger = this.engine.signal<RegistrationPayload | null>(
    null,
    'reg:submitTrigger'
  )

  private schema: ValidationSchema<RegistrationPayload> = {
    email: (val) =>
      val.includes('@') && val.endsWith('.com')
        ? true
        : 'Разрешена регистрация только в домене .com',
    age: (val) => (val >= 18 ? true : 'Регистрация строго с 18 лет'),
  }

  // Оборачиваем сетевой запрос в асинхронный декоратор валидации
  private validatedSubmitFetcher = withValidationAsync(
    async (payload: RegistrationPayload, abortSignal: AbortSignal) => {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      })

      if (!res.ok) {
        throw new Error(`Ошибка сервера: ${res.status}`)
      }

      return res.json()
    },
    {
      schema: this.schema,
      errorsSignal: this.errors,
    }
  )

  // Связываем валидируемый fetcher с реактивным ресурсом
  public submitResource = this.engine.resource(
    async (payload, abortSignal) => {
      if (!payload) return null
      return this.validatedSubmitFetcher(payload, abortSignal)
    },
    this.submitTrigger,
    {
      name: 'reg:submitResource',
      validateBeforeFetch: (payload) => payload !== null || 'Форма не отправлена',
    }
  )

  public submit() {
    // Передаём плоский снимок текущего Proxy-состояния в триггер ресурса
    this.submitTrigger.value = { ...this.form }
  }
}
```

#### Преимущества связки `reactive` + `withValidationAsync` + `resource`

- Единый источник истины для ошибок: Ошибки схемы автоматически попадают в `errorsSignal` (удобно для подсветки конкретных `<input>`), а сам ресурс фиксирует остановку операции в `submitResource.value.error` (`'Core validation stopper'`).
- Защита от двойного сабмита: При повторном вызове `submit()` предыдущий незавершённый HTTP-запрос автоматически отменится через `abortSignal` внутри `resource`

::: warning Особенность интеграции с Vue 3
В **React** паттерн `engine.reactive()` даёт максимальный выигрыш, позволяя обновлять отдельные поля формы без `React.memo` и дробления контекстов. Однако во **Vue 3** под капотом уже используется собственная Proxy-система (`reactive` / `shallowRef`), поэтому оборачивать объекты в `engine.reactive()` для передачи во Vue не требуется (это создаст двойное проксирование). Для Vue 3 оптимальнее хранить состояние в обычных `engine.signal()`.
:::
