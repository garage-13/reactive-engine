import { ReactiveEngine } from '../../core'

interface ThrottleComputedOptions {
  /** Лимит троттлинга в миллисекундах */
  limit: number;
}

/**
 * Специализированный декоратор для создания затроттленных вычисляемых свойств (computed).
 * Ограничивает частоту обновления значения сигнала, предотвращая "дребезг" и высокую частоту тиков
 * при спаме входных данных (например, при движении мыши, скролле или вводе текста).
 *
 * @param engine Экземпляр реактивного движка для создания сигналов
 * @param getter Чистая функция вычисления значения
 * @param options Настройки троттлинга (limit в мс)
 * @param signalName Необязательное имя для логгера
 */
export const withThrottleComputed = <T>(
  engine: ReactiveEngine,
  getter: () => T,
  options: ThrottleComputedOptions,
  signalName?: string
) => {
  const name = signalName || 'throttled_computed:unnamed';
  const limit = options.limit;

  // 1. Создаем внутренний сигнал для хранения затроттленного значения
  // Инициализируем его самым первым, стартовым расчетом геттера
  const throttledSignal = engine.signal<T>(getter(), `signal:internal:${name}`);

  let lastRunTime = 0;
  let timeoutId: any = null;
  let pendingValue: T | null = null;
  let hasPending = false;

  // Вспомогательная функция для безопасного обновления сигнала
  const updateSignal = (value: T) => {
    throttledSignal.value = value;
    lastRunTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    hasPending = false;
    timeoutId = null;
  };

  // 2. Создаем системный computed-эффект ядра.
  // Он будет автоматически запускаться на КАЖДЫЙ пиксель движения мыши/изменение сырого сигнала,
  // собирать зависимости, но применять алгоритм троттлинга перед обновлением throttledSignal.
  engine.effect(() => {
    const freshValue = getter(); // Нативно считываем сырой сигнал и подписываемся на него
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timePassed = now - lastRunTime;

    if (timePassed >= limit) {
      // Сценарий А: Лимит времени исчерпан — мгновенно пушим значение на экран
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      updateSignal(freshValue);
    } else {
      // Сценарий Б: Спам продолжается внутри окна 300мс — кэшируем последнее "хвостовое" значение
      pendingValue = freshValue;
      hasPending = true;

      // Планируем вызов "хвоста", чтобы последнее движение мыши гарантированно отобразилось на экране
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (hasPending) {
            updateSignal(pendingValue as T);
          }
        }, limit - timePassed);
      }
    }
  }, `effect:throttle-scheduler:${name}`);

  // Очистка таймеров при полном уничтожении (опционально, если будете регистрировать в реестре)
  const destroy = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  // 3. Возвращаем наружу объект, полностью совместимый по контракту с вашим Computed/Signal
  return {
    get value(): T {
      return throttledSignal.value;
    },
    subscribe: (cb: (val: T) => void) => throttledSignal.subscribe(cb),
    destroy
  };
};
