import { describe, it, expect, beforeEach, vi } from 'vitest'
import React, { useEffect, useRef } from 'react'
import { render, screen, act } from '@testing-library/react'
import { ReactiveEngine } from '../core/core'
import { createObserver } from './createObserver'

describe('HOC: observer', () => {
  let engine: ReactiveEngine;
  let observer: any;

  beforeEach(() => {
    engine = new ReactiveEngine();
    observer = createObserver(engine);
  });

  it('должен автоматически подписывать компонент на сигналы, прочитанные в JSX, и вызывать ререндер', async () => {
    const textSignal = engine.signal('Hello');
    const countSignal = engine.signal(0);

    // Используем объект для хранения точного количества совершенных коммитов в DOM
    const commitCount = { value: 0 };

    const TestComponent = observer(() => {
      // Регистрируем реальный коммит в интерфейс
      useEffect(() => {
        commitCount.value++;
      });

      return (
        <div>
          <span data-testid="text-node">{textSignal.value}</span>
          <span data-testid="count-node">{countSignal.value}</span>
        </div>
      );
    });

    render(
      <React.StrictMode>
        <TestComponent />
      </React.StrictMode>
    );

    expect(screen.getByTestId('text-node').textContent).toBe('Hello');
    expect(screen.getByTestId('count-node').textContent).toBe('0');

    // Сбрасываем счетчик после первоначального двойного монтирования StrictMode
    commitCount.value = 0;

    // 1. Изменяем первый сигнал
    await act(async () => {
      textSignal.value = 'World';
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('text-node').textContent).toBe('World');
    });

    // Автобатчинг + React вызвали ровно 1 реальный коммит обновления на экране!
    expect(commitCount.value).toBe(1);

    // Сбрасываем счетчик для следующего шага
    commitCount.value = 0;

    // 2. Изменяем второй сигнал
    await act(async () => {
      countSignal.value = 42;
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('count-node').textContent).toBe('42');
    });

    // Произошел второй изолированный коммит
    expect(commitCount.value).toBe(1);
  });
});
