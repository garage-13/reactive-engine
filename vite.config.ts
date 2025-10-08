import dts from "vite-plugin-dts";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, UserConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [dts({ rollupTypes: true, insertTypesEntry: true }), react()],
  resolve: {
    dedupe: ["react", "react-dom"], // Prevents multiple React instances
  },
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "MyLib", // Global variable name for IIFE
      formats: ["es", "cjs", "iife"], // ES/CJS for npm, IIFE for CDN
      fileName: (format) =>
        `index.${format === "es" ? "mjs" : format === "cjs" ? "cjs" : "iife.js"}`,
    },
    rollupOptions: {
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
