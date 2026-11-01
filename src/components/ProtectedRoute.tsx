import { Navigate } from '../router';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'materially_responsible' | 'viewer';
}

const roleHierarchy = { admin: 3, materially_responsible: 2, viewer: 1 } as const;

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  // ВАЖНО (баг «F5 сбрасывает на Обзор»): раньше здесь проверялся только currentUser,
  // который восстанавливается из /auth/me АСИНХРОННО. При F5 на /staff или /organization
  // в первые кадры currentUser === null → редирект на /login → после bootstrap
  // DefaultAuthenticatedRedirect кидал на /dashboard. Визуально это выглядело как
  // «страница перезагрузилась и перекинула на вкладку Обзор».
  // Теперь: пока сессия не восстановлена (initialized === false), НЕ редиректим —
  // рендерим прозрачный оверлей поверх текущего URL. Адрес страницы сохраняется,
  // контент появляется сразу после bootstrap без каких-либо перескоков.
  const currentUser = useAuthStore((s) => s.currentUser);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized || !currentUser) {
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
