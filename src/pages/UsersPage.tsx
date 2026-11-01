import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Shield, ShieldCheck, Eye, X, CheckCircle, XCircle, Edit, Trash2, Plus, Search, Filter, History, Save } from 'lucide-react';
import type { User, UserRole, HistoryEntry } from '../types';
import { api } from '../api/client';
import { HistoryLog } from '../components/HistoryLog';
import { FilterManager, SavedFilter } from '../components/FilterManager';

const roleLabels: Record<UserRole, string> = {
  admin: 'Администратор',
  materially_responsible: 'Мат. ответственное лицо',
  viewer: 'Пользователь',
};

const roleIcons: Record<UserRole, React.ElementType> = {
  admin: ShieldCheck,
  materially_responsible: Shield,
  viewer: Eye,
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  materially_responsible: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

export function UsersPage() {
  const { users, addUser, updateUser, deleteUser, currentUser } = useAuthStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [viewingHistory, setViewingHistory] = useState<User | null>(null);
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    const saved = localStorage.getItem('users-filters');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('users-filters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  const currentFilters = { searchQuery, filterRole, filterStatus };

  const handleSaveFilter = (name: string, filters: Record<string, any>) => {
    const newFilter: SavedFilter = { id: Date.now().toString(), name, filters };
    setSavedFilters([...savedFilters, newFilter]);
  };

  const handleLoadFilter = (filters: Record<string, any>) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.filterRole !== undefined) setFilterRole(filters.filterRole);
    if (filters.filterStatus !== undefined) setFilterStatus(filters.filterStatus);
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== id));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterStatus('all');
  };

  const isAdmin = currentUser?.role === 'admin';

  const filteredUsers = users.filter(user => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      user.fullName.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      roleLabels[user.role].toLowerCase().includes(q);
    const matchesRole = !filterRole || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' && user.isActive) || (filterStatus === 'inactive' && !user.isActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Пользователи системы</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Управление учётными записями</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
          <Plus className="w-5 h-5" />Добавить пользователя
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"><Filter className="w-4 h-4" />Фильтры</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilterManager(!showFilterManager)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <Save className="w-3 h-3" />
              Управление фильтрами
            </button>
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <X className="w-3 h-3" />
              Сбросить
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск по ФИО, email, роли..." className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все роли</option>
            {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Заблокированные</option>
          </select>
        </div>
        {showFilterManager && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <FilterManager
              currentFilters={currentFilters}
              savedFilters={savedFilters}
              onSaveFilter={handleSaveFilter}
              onLoadFilter={handleLoadFilter}
              onDeleteFilter={handleDeleteFilter}
            />
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Пользователь</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Роль</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Статус</th>
                {isAdmin && <th className="text-left px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Дата создания</th>}
                <th className="text-right px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredUsers.map(user => {
                const Icon = roleIcons[user.role];
                return (
                  <tr key={user.id} onClick={() => canEditUser(user) && setEditingUser(user)} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm">{user.fullName.charAt(0)}</div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{user.fullName}</p>
                          {user.id === currentUser?.id && <span className="text-xs text-indigo-500 dark:text-indigo-400">(это вы)</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${roleColors[user.role]}`}><Icon className="w-3 h-3" />{roleLabels[user.role]}</span>
                    </td>
                    <td className="px-6 py-4">
                      {user.isActive ? <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> Активен</span> : <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-sm"><XCircle className="w-4 h-4" /> Заблокирован</span>}
                    </td>
                    {isAdmin && <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(user.createdAt).toLocaleDateString('ru-RU')}</td>}
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openHistory(user)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30" title="История изменений"><History className="w-4 h-4" /></button>
                        {canEditUser(user) && <button onClick={() => setEditingUser(user)} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Edit className="w-4 h-4" /></button>}
                        {user.id !== currentUser?.id && <button onClick={() => { if (confirm('Удалить?')) deleteUser(user.id); }} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && <UserModal onClose={() => setShowAddModal(false)} onSave={(data) => { addUser(data as any); setShowAddModal(false); }} />}
      {editingUser && <UserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={(data) => { updateUser(editingUser.id, data); setEditingUser(null); }} />}
      
      {viewingHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
              <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                <History className="w-6 h-6" />
                История изменений: {viewingHistory.fullName}
              </h2>
              <button onClick={() => setViewingHistory(null)} className="text-gray-400 hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {historyLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Загрузка истории…</p>
              ) : (
                <HistoryLog history={historyData} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function canEditUser(user: User) {
    return currentUser?.role === 'admin' || user.id === currentUser?.id;
  }

  async function openHistory(user: User) {
    setViewingHistory(user);
    setHistoryLoading(true);
    try {
      const history = await api.get<HistoryEntry[]>(`/users/${user.id}/history`);
      setHistoryData(history);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }
}

function UserModal({ user, onClose, onSave }: any) {
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '', email: user?.email || '', password: '',
    role: user?.role || 'viewer', isActive: user?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { fullName: formData.fullName, email: formData.email, role: formData.role, isActive: formData.isActive };
    if (formData.password) data.password = formData.password;
    onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{user ? 'Редактировать' : 'Новый пользователь'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ФИО *</label><input type="text" value={formData.fullName} onChange={(e) => setFormData(p => ({ ...p, fullName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label><input type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{user ? 'Новый пароль' : 'Пароль *'}</label><input type="password" value={formData.password} onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required={!user} /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль</label><select value={formData.role} onChange={(e) => setFormData(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"><option value="admin">Администратор</option><option value="materially_responsible">Мат. ответственное лицо</option><option value="viewer">Пользователь</option></select></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">Активен</label></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{user ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
