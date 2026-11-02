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
  register: (email: string, password: string, fullName: string, joinOrganizationId?: string | null) => Promise<{ success: boolean; error?: string; pendingJoin?: boolean }>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
  addUser: (data: { email: string; password: string; fullName: string; role: UserRole; isActive?: boolean; organizationId?: string | null }) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<User> & { password?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<{ success: boolean; error?: string }>;
  /** Обновить пользователя в сессии без перезагрузки (после создания организации бэкенд перевыпускает токен). */
  setCurrentUser: (user: User | null) => void;
  myOrganizations: () => NonNullable<User['accessibleOrganizations']>;
  canCreateOrganization: () => boolean;
  getUserRole: () => UserRole | null;
  canEdit: () => boolean;
  /**
   * Полное право на удаление и управление справочниками/организациями — только admin.
   * Синхронизировано с бэкендом (requireRole(['admin'])).
   */
  isAdmin: () => boolean;
  canManageUsers: () => boolean;
  hasOrganization: () => boolean;
  // --- Ролевые права (синхронизировано с матрицей прав backend/src/index.ts,
  //     функции canEditDirectory / константы ORG_CREATE_ROLES, EMPLOYEE_MANAGE_ROLES,
  //     ASSIGN_ROLES, SERVER_ROLES) ---
  /** Создание организаций: admin + hr_specialist (ORG_CREATE_ROLES). */
  canCreateOrg: () => boolean;
  /** CRUD сотрудников: admin + hr_specialist (EMPLOYEE_MANAGE_ROLES). */
  canManageEmployees: () => boolean;
  /** Создание/редактирование карточек серверов/кластеров: admin + HR + sysadmin (см. isInfraEquipment на бэкенде). */
  canManageServerCards: () => boolean;
  /** Связка «сотрудник ↔ оборудование»: admin + HR + МОЛ (ASSIGN_ROLES). */
  canAssignEquipment: () => boolean;
  /** Серверные разделы (физические серверы / ВМ / платформы виртуализации): admin + sysadmin (SERVER_ROLES). */
  canManageServers: () => boolean;
  /**
   * Право на редактирование конкретного справочника (model: 'department' |
   * 'position' | 'branch' | 'dataCenter') — зеркало canEditDirectory() с бэкенда:
   * HR — всё кроме ЦОД, sysadmin — только ЦОД, admin — всё.
   */
  canEditDirectory: (model: string) => boolean;
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
      // Список пользователей (страница «Пользователи» и карточка /users/:id)
      // загружается сразу при восстановлении сессии — иначе после F5/входа
      // массив users пуст, и карточка показывает «Пользователь не найден».
      // Для не-админов /users вернёт 403 — ошибка молча игнорируется.
      void refreshUsers();
    } catch (e) {
      // ВАЖНО («вечное колёсико загрузки»): токен сбрасываем ТОЛЬКО при реальном
      // 401 (сессия истекла / недействительна). При сетевых ошибках (status 0 —
      // «Сервер недоступен») и временных 5xx (например, nginx отдаёт 502/503,
      // пока backend ещё стартует) токен сохраняем: bootstrap повторится позже
      // (retry ниже), а ProtectedRoute по таймауту сам покажет понятный экран,
      // а не бесконечный спиннер.
      const status = e instanceof ApiError ? e.status : -1;
      if (status === 401 || status === 403) {
        setToken(null);
        setCurrentUser(null);
      } else {
        setCurrentUser(null);
      }
    } finally {
      setInitialized(true);
      setBootstrapping(false);
    }
  }, [refreshUsers]);

  // Восстановление сессии при монтировании приложения
  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Фоновый retry: если токен есть, но сессия не восстановилась (backend был
  // недоступен в момент старта), повторяем bootstrap каждые 10 секунд.
  // Как только currentUser появится или токен будет сброшен — интервал гаснет.
  useEffect(() => {
    if (bootstrapping) return;
    if (currentUser || !getToken()) return;
    const t = setInterval(() => {
      if (getToken()) void bootstrap();
    }, 10000);
    return () => clearInterval(t);
  }, [bootstrap, bootstrapping, currentUser]);

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

  // joinOrganizationId — чекбокс «Присоединиться к существующей организации»:
  // бэкенд создаёт заявку (JoinRequest), доступ к организации появится только
  // после одобрения администратором системы (pendingJoin === true).
  const register = useCallback(async (email: string, password: string, fullName: string, joinOrganizationId?: string | null) => {
    try {
      const res = await api.post<{ token: string; user: User; joinRequest: { status: string; organization: string } | null }>(
        '/auth/register',
        { email, password, fullName, joinOrganizationId: joinOrganizationId ?? null },
      );
      // Заявка на вступление: пользователя НЕ авторизуем (токен не сохраняем) —
      // до одобрения администратором системы показываем экран ожидания и выход.
      if (res.joinRequest) {
        setInitialized(true);
        return { success: true, pendingJoin: true };
      }
      setToken(res.token);
      syncThemeFromProfile(res.user.theme);
      setCurrentUser(res.user);
      setInitialized(true);
      return { success: true, pendingJoin: false };
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
      setCurrentUser,
      myOrganizations: () => currentUser?.accessibleOrganizations ?? [],
      canCreateOrganization: () => currentUser?.role === 'admin' || currentUser?.role === 'hr_specialist',
      getUserRole: () => currentUser?.role || null,
      // Бизнес-логика (решение от 2026-11): работа МОЛ — только связка
      // «сотрудник ↔ оборудование» (assign/unassign). Создание/редактирование
      // сотрудников, серверов, ВМ, справочников и т.п. для МОЛ запрещено на UI.
      // NOTE: бэкенд пока допускает materially_responsible на POST/PUT по
      // employees/equipment/VM — это расхождение оставлено сознательно
      // (отладка в процессе тестирования сервиса).
      canEdit: () => currentUser?.role === 'admin',
      isAdmin: () => currentUser?.role === 'admin',
      canManageUsers: () => currentUser?.role === 'admin',
      hasOrganization: () => !!currentUser?.organizationId,
      canCreateOrg: () => currentUser?.role === 'admin' || currentUser?.role === 'hr_specialist',
      canManageEmployees: () => currentUser?.role === 'admin' || currentUser?.role === 'hr_specialist',
      /**
       * Создание/редактирование карточек серверов и кластеров.
       * Зеркало бэкенда: POST/PUT /api/equipment доступны admin+HR для любой техники,
       * а sysadmin — только для инфраструктурной (serverRole задан, см. isInfraEquipment).
       * В разделе «Физические серверы» вся создаваемая техника инфраструктурная,
       * поэтому здесь достаточно admin+sysadmin+HR.
       */
      canManageServerCards: () => currentUser?.role === 'admin' || currentUser?.role === 'sysadmin' || currentUser?.role === 'hr_specialist',
      canAssignEquipment: () => currentUser?.role === 'admin' || currentUser?.role === 'hr_specialist' || currentUser?.role === 'materially_responsible',
      canManageServers: () => currentUser?.role === 'admin' || currentUser?.role === 'sysadmin',
      // Зеркало canEditDirectory() из backend/src/index.ts
      canEditDirectory: (model: string) => {
        const role = currentUser?.role ?? '';
        if (role === 'admin') return true;
        if (role === 'hr_specialist') return model !== 'dataCenter';
        if (role === 'sysadmin') return model === 'dataCenter';
        return false;
      },
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
  setCurrentUser: () => {},
  myOrganizations: () => [],
  canCreateOrganization: () => false,
  getUserRole: () => null,
  canEdit: () => false,
  isAdmin: () => false,
  canManageUsers: () => false,
  hasOrganization: () => false,
  canCreateOrg: () => false,
  canManageEmployees: () => false,
  canManageServerCards: () => false,
  canAssignEquipment: () => false,
  canManageServers: () => false,
  canEditDirectory: () => false,
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
