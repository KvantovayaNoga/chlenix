// ============================================================
// Состояние авторизации и пользователей.
// Реализовано на React Context — Zustand из проекта удалён.
// Все данные пользователей хранятся в серверной БД (PostgreSQL).
// В localStorage сохраняется только JWT-токен сессии.
// Первый зарегистрированный пользователь автоматически получает роль «admin».
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, UserRole, ThemePreference } from '../types';
import { api, getToken, setToken, ApiError } from '../api/client';
import { syncThemeFromProfile } from './themeStore';

interface AuthState {
  currentUser: User | null;
  users: User[];
  isAuthenticated: boolean;
  initialized: boolean;
  bootstrapping: boolean;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
  addUser: (data: { email: string; password: string; fullName: string; role: UserRole; isActive?: boolean; organizationId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<User> & { password?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<{ success: boolean; error?: string }>;
  myOrganizations: () => Array<{ id: string; name: string; isOwn: boolean }>;
  canCreateOrganization: () => boolean;
  getUserRole: () => UserRole | null;
  canEdit: () => boolean;
  canManageUsers: () => boolean;
  hasOrganization: () => boolean;
}

async function call(fn: () => Promise<unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    await fn();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const isAuthenticated = !!currentUser;

  const refreshUsers = useCallback(async () => {
    try {
      const list = await api.get<User[]>('/users');
      setUsers(list);
    } catch {
      // ошибка будет показана через текущие операции; список останется прежним
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (!getToken()) {
      setInitialized(true);
      setCurrentUser(null);
      return;
    }
    setBootstrapping(true);
    try {
      const user = await api.get<User>('/auth/me');
      syncThemeFromProfile(user.theme);
      setCurrentUser(user);
    } catch {
      setToken(null);
      setCurrentUser(null);
    } finally {
      setInitialized(true);
      setBootstrapping(false);
    }
  }, []);

  // Восстановление сессии при монтировании приложения
  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Истечение сессии — очищаем состояние, роутер перенаправит на страницу входа
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setCurrentUser(null);
      setUsers([]);
    };
    window.addEventListener('chlenix:unauthorized', onUnauthorized);
    return () => window.removeEventListener('chlenix:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
      setToken(res.token);
      syncThemeFromProfile(res.user.theme);
      setCurrentUser(res.user);
      setInitialized(true);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', { email, password, fullName });
      setToken(res.token);
      syncThemeFromProfile(res.user.theme);
      setCurrentUser(res.user);
      setInitialized(true);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
    }
  }, []);

  // Переключение активной организации: backend перевыпускает JWT с новой организацией.
  const switchOrganization = useCallback(async (organizationId: string) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/switch-organization', { organizationId });
      setToken(res.token);
      syncThemeFromProfile(res.user.theme);
      setCurrentUser(res.user);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
    setUsers([]);
  }, []);

  const addUser = useCallback(
    async (data: { email: string; password: string; fullName: string; role: UserRole; isActive?: boolean; organizationId?: string | null }) => {
      const result = await call(() => api.post('/users', data));
      if (result.success) await refreshUsers();
      return result;
    },
    [refreshUsers],
  );

  const updateUser = useCallback(
    async (id: string, data: Partial<User> & { password?: string }) => {
      const result = await call(() => api.put(`/users/${id}`, data));
      if (result.success) {
        await refreshUsers();
        try {
          const me = await api.get<User>('/auth/me');
          setCurrentUser(me);
        } catch {
          /* сессия будет обработана клиентом API */
        }
      }
      return result;
    },
    [refreshUsers],
  );

  const deleteUser = useCallback(
    async (id: string) => {
      const result = await call(() => api.delete(`/users/${id}`));
      if (result.success) await refreshUsers();
      return result;
    },
    [refreshUsers],
  );

  // Сохранение выбора темы оформления выполняется в серверную БД
  const setTheme = useCallback(async (theme: ThemePreference) => {
    try {
      const updated = await api.patch<User>('/users/me/theme', { theme });
      setCurrentUser(updated);
    } catch {
      // при недоступности сервера тема останется применённой локально до следующей синхронизации
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      currentUser,
      users,
      isAuthenticated,
      initialized,
      bootstrapping,
      bootstrap,
      login,
      register,
      logout,
      refreshUsers,
      addUser,
      updateUser,
      deleteUser,
      setTheme,
      switchOrganization,
      myOrganizations: () => currentUser?.accessibleOrganizations ?? [],
      canCreateOrganization: () => currentUser?.role === 'admin',
      getUserRole: () => currentUser?.role || null,
      canEdit: () => currentUser?.role === 'admin' || currentUser?.role === 'materially_responsible',
      canManageUsers: () => currentUser?.role === 'admin',
      hasOrganization: () => !!currentUser?.organizationId,
    }),
    [currentUser, users, isAuthenticated, initialized, bootstrapping, bootstrap, login, register, logout, refreshUsers, addUser, updateUser, deleteUser, setTheme, switchOrganization],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Резервное состояние на случай, если хук вызван вне <AuthProvider>:
// рендер не должен обрываться ошибкой (иначе страница — только фон).
const authFallback: AuthState = {
  currentUser: null,
  users: [],
  isAuthenticated: false,
  initialized: true,
  bootstrapping: false,
  bootstrap: async () => {},
  login: async () => ({ success: false, error: 'Сервер недоступен' }),
  register: async () => ({ success: false, error: 'Сервер недоступен' }),
  logout: () => {},
  refreshUsers: async () => {},
  addUser: async () => ({ success: false, error: 'Сервер недоступен' }),
  updateUser: async () => ({ success: false, error: 'Сервер недоступен' }),
  deleteUser: async () => ({ success: false, error: 'Сервер недоступен' }),
  setTheme: async () => {},
  switchOrganization: async () => ({ success: false, error: 'Сервер недоступен' }),
  myOrganizations: () => [],
  canCreateOrganization: () => false,
  getUserRole: () => null,
  canEdit: () => false,
  canManageUsers: () => false,
  hasOrganization: () => false,
};

// Совместимое имя хука. Вызов без аргумента возвращает всё состояние;
// вызов с селектором — выбранное поле.
export function useAuthStore(): AuthState;
export function useAuthStore<T>(selector: (state: AuthState) => T): T;
export function useAuthStore<T>(selector?: (state: AuthState) => T): AuthState | T {
  const ctx = useContext(AuthContext);
  const value = ctx ?? authFallback;
  return selector ? selector(value) : value;
}
