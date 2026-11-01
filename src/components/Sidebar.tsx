import { NavLink, useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Monitor,
  Server,
  UserCog,
  LogOut,
  Shield,
  Cpu,
  Info,
  ChevronLeft,
  ChevronRight,
  Building2,
  BookMarked,
} from 'lucide-react';

const roleLabels = {
  admin: 'Администратор',
  materially_responsible: 'Мат. ответственное лицо',
  viewer: 'Пользователь',
};

const roleColors = {
  admin: 'bg-red-100 text-red-700',
  materially_responsible: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-700',
};

export function Sidebar() {
  const { currentUser, logout, canManageUsers, myOrganizations, switchOrganization } = useAuthStore();
  const { organizations } = useDataStore();
  const organization = organizations.find((o) => o.id === currentUser?.organizationId);
  const navigate = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Список организаций для переключения (админ — все организации системы)
  const accessibleOrgs = myOrganizations();
  const showSwitcher = accessibleOrgs.length > 1;

  const handleSwitchOrg = async (orgId: string) => {
    if (!orgId || orgId === currentUser?.organizationId || switching) return;
    setSwitching(true);
    const res = await switchOrganization(orgId);
    setSwitching(false);
    if (res.success) {
      // Данные активной организации перезагрузятся автоматически (dataStore следит за сменой orgId)
      navigate('/dashboard');
    } else {
      alert(res.error || 'Не удалось переключить организацию');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleProfileClick = () => {
    if (currentUser) {
      navigate(`/users/${currentUser.id}`);
    }
  };

  // Новый порядок вкладок
  const navItems = [
    { to: '/dashboard', label: 'Обзор', icon: LayoutDashboard },
    { to: '/organization', label: organization ? organization.shortName || organization.name : 'Организация', icon: Building2 },
    { to: '/staff', label: 'Штатное расписание', icon: BookMarked },
    { to: '/employees', label: 'Сотрудники', icon: Users },
    { to: '/equipment', label: 'Оборудование', icon: Monitor },
    { to: '/servers/physical', label: 'Физические серверы', icon: Server },
    { to: '/servers', label: 'Виртуальные машины', icon: Cpu },
  ];

  if (canManageUsers()) {
    navItems.push({ to: '/users', label: 'Пользователи', icon: UserCog });
    navItems.push({ to: '/about', label: 'О системе', icon: Info });
  }

  return (
    <aside className={`${isMinimized ? 'w-20' : 'w-72'} bg-slate-900 text-white flex flex-col h-screen sticky top-0 transition-all duration-300`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        {!isMinimized && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Cpu className="w-6 h-6" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Chlenix</h1>
          </div>
        )}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          title={isMinimized ? 'Развернуть' : 'Свернуть'}
        >
          {isMinimized ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Profile */}
      <div 
        className="p-4 border-b border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={handleProfileClick}
        title={isMinimized ? currentUser?.fullName : ''}
      >
        {isMinimized ? (
          <div className="flex justify-center">
            {currentUser?.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.fullName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium">
                {currentUser?.fullName.charAt(0)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {currentUser?.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.fullName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                {currentUser?.fullName.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentUser?.fullName}</p>
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${roleColors[currentUser?.role || 'viewer']}`}>
                <Shield className="w-3 h-3 inline mr-1" />
                {roleLabels[currentUser?.role || 'viewer']}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex items-center ${isMinimized ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            title={isMinimized ? item.label : ''}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isMinimized && <span className="font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className={`flex items-center ${isMinimized ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-all duration-200 w-full`}
          title={isMinimized ? 'Выйти' : ''}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!isMinimized && <span className="font-medium">Выйти</span>}
        </button>
      </div>
    </aside>
  );
}
