import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Версия приложения для страницы «О системе» — единый источник: package.json.
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
  build: {
    // Разбиваем бандл на несколько чанков: браузер загружает их параллельно,
    // а редко меняющиеся библиотеки (react, lucide) кэшируются между релизами.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // React + роутинг/сторы — стабильная база приложения.
          if (/[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/.test(id)) {
            return "vendor-react";
          }
          // Иконки — самая тяжёлая UI-библиотека в проекте.
          if (id.includes("lucide")) return "vendor-icons";
          return "vendor";
        },
      },
    },
    // Порог предупреждения о размере чанка.
    chunkSizeWarningLimit: 500,
  },
});
