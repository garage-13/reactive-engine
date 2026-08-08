import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // NOTE: Неоходимо для тестирования react-адаптеров и ресурсов
    // NOTE: Обязательно для тестирования UI-компонентов Vue/React
  },
});
