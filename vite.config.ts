import { defineConfig, UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    dts({ bundleTypes: true, insertTypesEntry: true }),
    react()
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "ReactiveEngineLib",
      formats: ["es", "cjs", "iife"],
      fileName: (format: string) =>
        `index.${format === "es" ? "mjs" : format === "cjs" ? "cjs" : "iife.js"}`,
    },
    rollupOptions: {
      // Исключаем react из финального бандла, чтобы не дублировать код
      external: ["react", "react-dom"],
      output: {
        // Принудительно генерируем чистый ESM/CJS без лишних оберток
        interop: "auto",
        // Обеспечивает корректную работу дефолтных экспортов в гибридных бандлах
        exports: "named",
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      } as any, // Приведение к any убирает ошибку overload на объединении типов
    },

  },
} satisfies UserConfig);
