// ============================================================
// Тема оформления (светлая / тёмная / системная).
// Выбор пользователя сохраняется в серверной БД (поле users.theme),
// локальная копия в localStorage используется только как кэш,
// чтобы тема применялась до загрузки профиля.
// ============================================================
import { create } from 'zustand';
import type { ThemePreference } from '../types';

const THEME_CACHE_KEY = 'chlenix_theme';

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void; // только локальное применение (bootstrap/профиль)
}

export function readCachedTheme(): ThemePreference {
  const cached = localStorage.getItem(THEME_CACHE_KEY);
  return cached === 'light' || cached === 'dark' || cached === 'system' ? cached : 'system';
}

export function cacheTheme(theme: ThemePreference) {
  localStorage.setItem(THEME_CACHE_KEY, theme);
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Применяет тему к документу: добавляет/снимает класс `dark` у <html>
export function applyThemeToDocument(theme: ThemePreference) {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readCachedTheme(),
  setTheme: (theme) => {
    cacheTheme(theme);
    applyThemeToDocument(theme);
    set({ theme });
  },
}));

// Синхронизация темы с профилем пользователя (после bootstrap/логина)
export function syncThemeFromProfile(theme: ThemePreference | undefined) {
  useThemeStore.getState().setTheme(theme || 'system');
}

// Реакция на смену системной темы, пока выбрана «системная»
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      applyThemeToDocument('system');
    }
  });
}
