// ============================================================
// Тема оформления (светлая / тёмная / системная).
// Выбор пользователя сохраняется в серверной БД (поле users.theme),
// локальная копия в localStorage используется только как кэш,
// чтобы тема применялась до загрузки профиля.
// Реализовано на React Context — Zustand из проекта удалён.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemePreference } from '../types';

const THEME_CACHE_KEY = 'chlenix_theme';

export function readCachedTheme(): ThemePreference {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    return cached === 'light' || cached === 'dark' || cached === 'system' ? cached : 'system';
  } catch {
    return 'system';
  }
}

export function cacheTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* localStorage недоступен (например, приватный режим) */
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Применяет тему к документу: добавляет/снимает класс `dark` у <html>
export function applyThemeToDocument(theme: ThemePreference) {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void; // только локальное применение + кэш
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readCachedTheme());

  const setTheme = useCallback((next: ThemePreference) => {
    cacheTheme(next);
    applyThemeToDocument(next);
    setThemeState(next);
  }, []);

  // Реакция на смену системной темы, пока выбрана «системная»
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setThemeState((current) => {
        if (current === 'system') applyThemeToDocument('system');
        return current;
      });
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Совместимое имя хука (используется в компонентах как раньше)
export function useThemeStore(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeStore must be used within ThemeProvider');
  return ctx;
}

// Синхронизация темы с профилем пользователя (после bootstrap/логина):
// применяем сохранённый выбор и обновляем локальный кэш.
export function syncThemeFromProfile(theme: ThemePreference | undefined) {
  const next = theme || 'system';
  cacheTheme(next);
  applyThemeToDocument(next);
}
