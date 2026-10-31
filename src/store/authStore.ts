import { create } from 'zustand';
import type { User, UserRole, ThemePreference } from '../types';
import { api, getToken, setToken, ApiError } from '../api/client';

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
  getUserRole: () => UserRole | null;
  canEdit: () => boolean;
  canManageUsers: () => boolean;
  hasOrganization: () => boolean;
}

// Все данные пользователей хранятся в серверной БД (PostgreSQL).
// В localStorage сохраняется только JWT-токен сессии.
// Первый зарегистрированный пользователь автоматически получает роль «admin».

async function call(fn: () => Promise<unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    await fn();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  users: [],
  isAuthenticated: false,
  initialized: false,
  bootstrapping: false,

  bootstrap: async () => {
    if (!getToken()) {
      set({ initialized: true, isAuthenticated: false, currentUser: null });
      return;
    }
    set({ bootstrapping: true });
    try {
      const user = await api.get<User>('/auth/me');
      set({ currentUser: user, isAuthenticated: true, initialized: true, bootstrapping: false });
    } catch {
      setToken(null);
      set({ currentUser: null, isAuthenticated: false, initialized: true, bootstrapping: false });
    }
  },

  login: async (email, password) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
      setToken(res.token);
      set({ currentUser: res.user, isAuthenticated: true, initialized: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
    }
  },

  register: async (email, password, fullName) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', { email, password, fullName });
      setToken(res.token);
      set({ currentUser: res.user, isAuthenticated: true, initialized: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof ApiError ? e.message : 'Сервер недоступен' };
    }
  },

  logout: () => {
    setToken(null);
    set({ currentUser: null, isAuthenticated: false, users: [] });
  },

  refreshUsers: async () => {
    try {
      const users = await api.get<User[]>('/users');
      set({ users });
    } catch {
      // ошибка будет показана через текущие операции; список останется прежним
    }
  },

  addUser: async (data) => {
    const result = await call(() => api.post('/users', data));
    if (result.success) await get().refreshUsers();
    return result;
  },

  updateUser: async (id, data) => {
    const result = await call(() => api.put(`/users/${id}`, data));
    if (result.success) {
      await get().refreshUsers();
      const me = get().currentUser;
      if (me && me.id === id) {
        try {
          const fresh = await api.get<User>('/auth/me');
          set({ currentUser: fresh });
        } catch {
          /* сессия будет обработана клиентом API */
        }
      }
    }
    return result;
  },

  deleteUser: async (id) => {
    const result = await call(() => api.delete(`/users/${id}`));
    if (result.success) await get().refreshUsers();
    return result;
  },

  // Сохранение выбора темы оформления выполняется в серверную БД
  setTheme: async (theme) => {
    const me = get().currentUser;
    if (!me) return;
    try {
      const updated = await api.patch<User>('/users/me/theme', { theme });
      set({ currentUser: updated });
    } catch {
      // при недоступности сервера тема применится локально до следующей синхронизации
    }
  },

  getUserRole: () => get().currentUser?.role || null,

  canEdit: () => {
    const role = get().currentUser?.role;
    return role === 'admin' || role === 'materially_responsible';
  },

  canManageUsers: () => get().currentUser?.role === 'admin',

  hasOrganization: () => !!get().currentUser?.organizationId,
}));
