import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./store/authStore";
import { DataProvider } from "./store/dataStore";
import { ThemeProvider, readCachedTheme, applyThemeToDocument } from "./store/themeStore";

// Применяем законсервированную тему до первой отрисовки (без «мигания» светлой темы)
applyThemeToDocument(readCachedTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
  </React.StrictMode>,
);
