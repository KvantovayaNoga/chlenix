import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';

interface AuthState {
  currentUser: User | null;
  users: User[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => { success: boolean; error?: string };
  register: (email: string, password: string, fullName: string) => { success: boolean; error?: string };
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'organizationId'> & { organizationId?: string | null }) => { success: boolean; error?: string };
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  getUserRole: () => UserRole | null;
  canEdit: () => boolean;
  canManageUsers: () => boolean;
  // Организация
  setOrganizationForUser: (userId: string, organizationId: string | null) => void;
  hasOrganization: () => boolean;
}

const now = new Date().toISOString();

const initialUsers: User[] = [
  {
    id: '1',
    email: 'admin@company.ru',
    password: 'admin123',
    fullName: 'Иванов Админ Админович',
    role: 'admin',
    createdAt: '2024-01-01',
    updatedAt: now,
    updatedBy: null,
    isActive: true,
  },
  {
    id: '2',
    email: 'mat@company.ru',
    password: 'mat123',
    fullName: 'Петрова Материальная Ответственная',
    role: 'materially_responsible',
    createdAt: '2024-01-15',
    updatedAt: now,
    updatedBy: null,
    isActive: true,
  },
  {
    id: '3',
    email: 'user@company.ru',
    password: 'user123',
    fullName: 'Сидоров Обычный Пользователь',
    role: 'viewer',
    createdAt: '2024-02-01',
    updatedAt: now,
    updatedBy: null,
    isActive: true,
  },
];

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: initialUsers,
      isAuthenticated: false,

      login: (email: string, password: string) => {
        const user = get().users.find(
          (u) => u.email === email && u.password === password && u.isActive
        );
        if (user) {
          set({ currentUser: user, isAuthenticated: true });
          return { success: true };
        }
        return { success: false, error: 'Неверный email или пароль' };
      },

      register: (email: string, password: string, fullName: string) => {
        const exists = get().users.find((u) => u.email === email);
        if (exists) {
          return { success: false, error: 'Пользователь с таким email уже существует' };
        }
        const historyEntry = {
          id: Date.now().toString(),
          action: 'created' as const,
          changedBy: fullName,
          changedAt: new Date().toISOString(),
        };
        const newUser: User = {
          id: Date.now().toString(),
          email,
          password,
          fullName,
          role: 'viewer',
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
          updatedBy: null,
          isActive: true,
          history: [historyEntry],
        };
        set((state) => ({
          users: [...state.users, newUser],
          currentUser: newUser,
          isAuthenticated: true,
        }));
        return { success: true };
      },

      logout: () => {
        set({ currentUser: null, isAuthenticated: false });
      },

      addUser: (userData) => {
        const exists = get().users.find((u) => u.email === userData.email);
        if (exists) {
          return { success: false, error: 'Пользователь с таким email уже существует' };
        }
        const currentUser = get().currentUser;
        const historyEntry = {
          id: Date.now().toString(),
          action: 'created' as const,
          changedBy: currentUser?.fullName || 'Система',
          changedAt: new Date().toISOString(),
        };
        const newUser: User = {
          ...userData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.id || null,
          history: [historyEntry],
        };
        set((state) => ({ users: [...state.users, newUser] }));
        return { success: true };
      },

      updateUser: (id, data) => {
        const currentUser = get().currentUser;
        const historyEntry = {
          id: Date.now().toString(),
          action: 'updated' as const,
          fieldName: Object.keys(data).join(', '),
          changedBy: currentUser?.fullName || 'Система',
          changedAt: new Date().toISOString(),
        };
        set((state) => {
          const updatedUsers = state.users.map((u) =>
            u.id === id
              ? { 
                  ...u, 
                  ...data, 
                  updatedAt: new Date().toISOString(), 
                  updatedBy: currentUser?.id || null,
                  history: [...(u.history || []), historyEntry]
                }
              : u
          );
          
          // Если обновляется текущий пользователь, обновляем и currentUser
          const updatedCurrentUser = currentUser?.id === id 
            ? updatedUsers.find(u => u.id === id) || currentUser
            : currentUser;
          
          return {
            users: updatedUsers,
            currentUser: updatedCurrentUser,
          };
        });
      },

      deleteUser: (id) => {
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        }));
      },

      getUserRole: () => get().currentUser?.role || null,

      canEdit: () => {
        const role = get().currentUser?.role;
        return role === 'admin' || role === 'materially_responsible';
      },

      canManageUsers: () => get().currentUser?.role === 'admin',

      // Организация: привязка пользователя к организации
      setOrganizationForUser: (userId, organizationId) => {
        set((state) => {
          const updatedUsers = state.users.map((u) =>
            u.id === userId ? { ...u, organizationId, updatedAt: new Date().toISOString() } : u
          );
          const updatedCurrentUser =
            state.currentUser?.id === userId
              ? updatedUsers.find((u) => u.id === userId) || state.currentUser
              : state.currentUser;
          return { users: updatedUsers, currentUser: updatedCurrentUser };
        });
      },

      hasOrganization: () => !!get().currentUser?.organizationId,
    }),
    {
      name: 'auth-storage',
    }
  )
);
