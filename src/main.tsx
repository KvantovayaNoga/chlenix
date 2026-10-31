import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { useAuthStore } from "./store/authStore";
import { useDataStore } from "./store/dataStore";
import { readCachedTheme, applyThemeToDocument } from "./store/themeStore";

// Применяем законсервированную тему до первой отрисовки (без «мигания» светлой темы)
applyThemeToDocument(readCachedTheme());

// Восстановление сессии и загрузка данных из серверной БД
void useAuthStore.getState().bootstrap().then(() => {
  if (useAuthStore.getState().isAuthenticated) {
    void useDataStore.getState().loadAll();
  }
});

// Истечение сессии — очищаем состояние, роутер перенаправит на страницу входа
window.addEventListener('chlenix:unauthorized', () => {
  useAuthStore.getState().logout();
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
