import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'materially_responsible' | 'viewer';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  // Надёжнее опираться на currentUser: при hard-refresh zustand persist
  // восстанавливает состояние асинхронно, и isAuthenticated может кратковременно
  // расходиться с currentUser.
  const { currentUser } = useAuthStore();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    const roleHierarchy = { admin: 3, materially_responsible: 2, viewer: 1 };
    if (roleHierarchy[currentUser.role] < roleHierarchy[requiredRole]) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
