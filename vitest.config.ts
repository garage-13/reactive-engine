import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Неоходимо для тестирования react-адаптеров и ресурсов
  },
});
