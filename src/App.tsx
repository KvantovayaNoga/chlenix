import { useEffect, type ReactNode } from 'react';
// Бандл react-router в production-сборке может содержать устаревшую копию
// React-контекста (несколько копий "react" в дереве node_modules на сервере) —
// из-за этого все роутер-хуки падали с «Uncaught Error» и страница оставалась
// пустой. Роутинг переведён на собственный мини-роутер без внешних зависимостей.
import { Routes, Route, Navigate, Router, useNavigate } from './router';
import { useAuthStore } from './store/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { ServersPage } from './pages/ServersPage';
import { PhysicalServersPage } from './pages/PhysicalServersPage';
import { VirtualizationPlatformPage } from './pages/VirtualizationPlatformPage';
import { UsersPage } from './pages/UsersPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { DirectoriesPage } from './pages/DirectoriesPage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { CreateOrganizationPage } from './pages/CreateOrganizationPage';
import { SwitchOrganizationPage } from './pages/SwitchOrganizationPage';
import { AboutPage } from './pages/AboutPage';

// После авторизации: если у пользователя нет организации — сначала предлагаем создать.
// ВАЖНО: редирект выполняется только когда пользователь реально загружен (bootstrap
// завершился). Раньше на время bootstrap'а currentUser === null, и «страховочный»
// wildcard-маршрут мгновенно кидал пользователя на /dashboard — это выглядело как
// «меня выкидывает на главную страницу без организации» сразу после её создания.
function DefaultAuthenticatedRedirect() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const initialized = useAuthStore((s) => s.initialized);
  if (!initialized || !currentUser) return null; // ждём восстановления сессии
  if (!currentUser.organizationId && (currentUser.role === "admin" || currentUser.role === "hr_specialist")) {
    return <Navigate to="/organization/create" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

// Гuard разделов по ролям: редирект на Обзор при прямом заходе по URL.
// (Названия страниц и кнопки при этом тоже скрываются через соответствующие
// can*()-хелперы authStore, синхронизированные с матрицей прав бэкенда.)
function RoleGuard({ roles, children }: { roles: string[]; children: ReactNode }) {
  const role = useAuthStore((s) => s.currentUser?.role);
  if (!role || !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Раздел «Администрирование» — только администратор системы (бэкенд: requireRole(['admin'])).
function AdminOnly({ children }: { children: ReactNode }) {
  return <RoleGuard roles={['admin']}>{children}</RoleGuard>;
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  // При истечении сессии (401 от API) перенаправляем на страницу входа
  // (состояние авторизации очищается в AuthProvider)
  useEffect(() => {
    const onUnauthorized = () => navigate('/login', { replace: true });
    window.addEventListener('chlenix:unauthorized', onUnauthorized);
    return () => window.removeEventListener('chlenix:unauthorized', onUnauthorized);
  }, [isAuthenticated, navigate]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <DefaultAuthenticatedRedirect /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <DefaultAuthenticatedRedirect /> : <RegisterPage />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Матрица доступа к разделам (синхронизировано с backend/src/index.ts):
              - серверные разделы: admin + sysadmin (SERVER_ROLES); МОЛ/HR закрыты;
              - сотрудники: просмотр для всех, CRUD — admin + HR (EMPLOYEE_MANAGE_ROLES);
              - оборудование: просмотр для всех, CRUD — admin + HR, связки — +МОЛ;
              - справочники («Штатное расписание»): просмотр для всех,
                редактирование по canEditDirectory() (HR — всё кроме ЦОД, sysadmin — только ЦОД). */}
          <Route path="/servers" element={<RoleGuard roles={['admin', 'sysadmin']}><ServersPage /></RoleGuard>} />
          <Route path="/servers/physical" element={<RoleGuard roles={['admin', 'sysadmin']}><PhysicalServersPage /></RoleGuard>} />
          <Route path="/servers/virtualization" element={<RoleGuard roles={['admin', 'sysadmin']}><VirtualizationPlatformPage /></RoleGuard>} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/directories" element={<DirectoriesPage />} />
          {/* Совместимость: Sidebar ведёт на /staff (Штатное расписание) — тот же раздел */}
          <Route path="/staff" element={<DirectoriesPage />} />
          <Route path="/admin" element={<AdminOnly><AdminPanelPage /></AdminOnly>} />
          <Route path="/organization" element={<OrganizationPage />} />
          <Route path="/organization/create" element={<RoleGuard roles={['admin', 'hr_specialist']}><CreateOrganizationPage /></RoleGuard>} />
          <Route path="/organization/switch" element={<SwitchOrganizationPage />} />
          <Route path="/users" element={<ProtectedRoute requiredRole="admin"><UsersPage /></ProtectedRoute>} />
          <Route path="/users/:id" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute requiredRole="admin"><AboutPage /></ProtectedRoute>} />
        </Route>

        {/* unknown route: guard waits for bootstrap (see DefaultAuthenticatedRedirect);
            while session is not restored yet we render nothing and KEEP the current URL,
            so F5 on any page never bounces through /login -> /dashboard */}
        <Route path="*" element={<DefaultAuthenticatedRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
