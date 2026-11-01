// ============================================================
// Тема оформления. По требованию пользователя интерфейс всегда
// работает в ТЁМНОЙ теме: переключатель темы удалён из UI, выбор
// больше не читается из localStorage/профиля и не зависит от
// системных настроек. Класс `dark` на <html> проставляется безусловно.
// ============================================================
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ThemePreference } from '../types';

export function readCachedTheme(): ThemePreference {
  return 'dark';
}

export function cacheTheme(_theme: ThemePreference) {
  /* no-op: тема зафиксирована (тёмная) */
}

// Применяет тему к документу: всегда тёмная (класс `dark` у <html>).
export function applyThemeToDocument(_theme?: ThemePreference) {
  document.documentElement.classList.add('dark');
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void; // no-op, оставлен для совместимости API
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  applyThemeToDocument();
  const value: ThemeContextValue = { theme: 'dark', setTheme: () => {} };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Совместимое имя хука (используется в компонентах как раньше)
const fixedTheme: ThemeContextValue = { theme: 'dark', setTheme: () => {} };

export function useThemeStore(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  return ctx ?? fixedTheme;
}

// Синхронизация темы с профилем пользователя — сохранена как no-op-заглушка:
// тема принудительно тёмная, профиль её не меняет.
export function syncThemeFromProfile(_theme: ThemePreference | undefined) {
  applyThemeToDocument();
}
