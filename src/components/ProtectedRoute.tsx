import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { getToken } from '../api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'materially_responsible' | 'viewer';
}

const roleHierarchy = { admin: 3, materially_responsible: 2, viewer: 1 } as const;

// Сколько миллисекунд ждём восстановления сессии, прежде чем показать
// пользовательству понятный экран вместо крутящегося бесконечно спиннера.
const BOOTSTRAP_TIMEOUT_MS = 15000;

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  // ВАЖНО (баг «F5 сбрасывает на Обзор»): раньше здесь проверялся только currentUser,
  // который восстанавливается из /auth/me АСИНХРОННО. При F5 на /staff или /organization
  // в первые кадры currentUser === null → редирект на /login → после bootstrap
  // DefaultAuthenticatedRedirect кидал на /dashboard. Визуально это выглядело как
  // «страница перезагрузилась и перекинула на вкладку Обзор».
  // Теперь: пока сессия не восстановлена (initialized === false), НЕ редиректим —
  // рендерим прозрачный оверлей поверх текущего URL. Адрес страницы сохраняется,
  // контент появляется сразу после bootstrap без каких-либо перескоков.
  //
  // ВАЖНО (баг «вечное колёсико загрузки»): если bootstrap завершился, но
  // currentUser так и не появился, раньше этот спиннер висел навсегда
  // (состояние «нет пользователя» и состояние «загрузка» визуально совпадали).
  // Теперь: нет токена → редирект на /login; токен есть, но сервер недоступен →
  // по таймауту показываем сообщение с кнопками «Повторить» и «Войти заново».
  const currentUser = useAuthStore((s) => s.currentUser);
  const initialized = useAuthStore((s) => s.initialized);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (initialized && !currentUser) {
      setTimedOut(true);
      return;
    }
    if (!initialized) {
      const t = setTimeout(() => setTimedOut(true), BOOTSTRAP_TIMEOUT_MS);
      return () => clearTimeout(t);
    }
    setTimedOut(false);
  }, [initialized, currentUser]);

  if (!currentUser) {
    // Сессии нет и токена тоже — честно идём на страницу входа
    // (роутер сохранит текущий URL, чтобы после логина вернуться сюда).
    if (initialized && !getToken()) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
        {timedOut ? (
          <div className="mx-4 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-gray-100">
              Сервер недоступен
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-gray-400">
              Не удалось восстановить сессию: backend не отвечает. Проверьте, что сервис запущен,
              и попробуйте ещё раз.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => { setTimedOut(false); void bootstrap(); }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Повторить
              </button>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Войти заново
              </button>
            </div>
          </div>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400" />
        )}
      </div>
    );
  }

  // Пока идёт повторный bootstrap (например, фоновый retry после сбоя сети),
  // старый currentUser ещё в состоянии — просто отдаём контент, он валиден
  // до тех пор, пока бэкенд явно не сообщит об истечении сессии (401).
  if (bootstrapping && !initialized) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-transparent pointer-events-none">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400" />
      </div>
    );
  }

  if (requiredRole && roleHierarchy[currentUser.role] < roleHierarchy[requiredRole]) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
