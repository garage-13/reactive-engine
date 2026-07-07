import { defineConfig, UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    // rollupTypes: true сохраняем — он собирает все типы в один красивый файл index.d.ts
    dts({ bundleTypes: true, insertTypesEntry: true }),
    react()
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    emptyOutDir: true,
    sourcemap: true, // Карты кода для удобной отладки пользователями
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "ReactiveEngineLib", // Имя глобальной переменной для IIFE (window.ReactiveEngineLib)
      formats: ["es", "cjs", "iife"],
      fileName: (format: string) =>
        `index.${format === "es" ? "mjs" : format === "cjs" ? "cjs" : "iife.js"}`,
    },
    rollupOptions: {
      // Исключаем react из финального бандла, чтобы не дублировать код
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
} satisfies UserConfig);
