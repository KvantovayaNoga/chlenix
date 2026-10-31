import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import { UsersPage } from './pages/UsersPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { DirectoriesPage } from './pages/DirectoriesPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { CreateOrganizationPage } from './pages/CreateOrganizationPage';
import { AboutPage } from './pages/AboutPage';

// После авторизации: если у пользователя нет организации — сначала предлагаем создать
function DefaultAuthenticatedRedirect() {
  const { currentUser } = useAuthStore();
  if (currentUser && !currentUser.organizationId) {
    return <Navigate to="/organization/create" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

function App() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // При истечении сессии (401 от API) перенаправляем на страницу входа
  // (состояние авторизации очищается в AuthProvider)
  useEffect(() => {
    const onUnauthorized = () => navigate('/login', { replace: true });
    window.addEventListener('chlenix:unauthorized', onUnauthorized);
    return () => window.removeEventListener('chlenix:unauthorized', onUnauthorized);
  }, [isAuthenticated, navigate]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <DefaultAuthenticatedRedirect /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <DefaultAuthenticatedRedirect /> : <RegisterPage />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/servers/physical" element={<PhysicalServersPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/directories" element={<DirectoriesPage />} />
          <Route path="/organization" element={<OrganizationPage />} />
          <Route path="/organization/create" element={<CreateOrganizationPage />} />
          <Route path="/users" element={<ProtectedRoute requiredRole="admin"><UsersPage /></ProtectedRoute>} />
          <Route path="/users/:id" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute requiredRole="admin"><AboutPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={isAuthenticated ? <DefaultAuthenticatedRedirect /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
