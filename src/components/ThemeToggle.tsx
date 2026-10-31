// ============================================================
// Переключатель темы оформления (светлая / тёмная / системная).
// Выбор сохраняется в серверную БД (users.theme) и кэшируется локально.
// ============================================================
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import type { ThemePreference } from '../types';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Системная', icon: Monitor },
];

interface ThemeToggleProps {
  compact?: boolean; // режим свёрнутого сайдбара — только иконки
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme: setLocalTheme } = useThemeStore();
  const { setTheme: persistTheme } = useAuthStore();

  const choose = (value: ThemePreference) => {
    // мгновенно применяем локально, затем сохраняем в БД
    setLocalTheme(value);
    void persistTheme(value);
  };

  return (
    <div
      className={`inline-flex items-center rounded-lg border p-0.5 ${
        compact ? 'border-slate-700 bg-slate-800 flex-col' : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800'
      }`}
      role="group"
      aria-label="Переключатель темы оформления"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            title={label}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            } ${compact ? 'justify-center px-2' : ''}`}
          >
            <Icon className="h-4 w-4" />
            {!compact && <span className="hidden sm:inline">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
