import { ReactiveEngine } from '../../core/core';

interface ThrottleComputedOptions {
  limit: number;
}

export const withThrottleComputed = <T>(
  engine: ReactiveEngine,
  getter: () => T,
  options: ThrottleComputedOptions,
  signalName?: string
) => {
  const name = signalName || 'throttled_computed:unnamed';
  const limit = options.limit;

  const initialValue = getter();
  const throttledSignal = engine.signal<T>(initialValue, `signal:internal:${name}`);

  // ИСПОЛЬЗУЕМ СТАНДАРТНЫЙ ТАЙМЕР ДЛЯ СИНХРOНИЗАЦИИ С ТЕСТАМИ
  let lastRunTime = 0;
  let timeoutId: any = null;
  let pendingValue: T | null = null;
  let hasPending = false;

  let isFirstEffectRun = true;

  const updateSignal = (value: T) => {
    throttledSignal.value = value;
    lastRunTime = Date.now(); // Перешли на Date.now() для 100% поддержки FakeTimers
    hasPending = false;
    timeoutId = null;
  };

  engine.effect(() => {
    const freshValue = getter(); // Собираем зависимости нативно

    if (isFirstEffectRun) {
      isFirstEffectRun = false;
      return;
    }

    const now = Date.now();

    // Если lastRunTime === 0 — это самое первое реальное изменение, пушим его сразу
    const timePassed = lastRunTime === 0 ? limit : (now - lastRunTime);

    if (timePassed >= limit) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      updateSignal(freshValue);
    } else {
      pendingValue = freshValue;
      hasPending = true;

      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (hasPending) {
            updateSignal(pendingValue as T);
          }
        }, limit - timePassed);
      }
    }
  }, `effect:throttle-scheduler:${name}`);

  const destroy = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };

  return {
    get value(): T {
      return throttledSignal.value;
    },
    subscribe: (cb: (val: T) => void) => throttledSignal.subscribe(cb),
    destroy
  };
};
