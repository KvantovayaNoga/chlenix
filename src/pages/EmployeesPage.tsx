import { useState, useEffect } from 'react';
import { useNavigate } from '../router';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { Search, Plus, UserCheck, UserX, Mail, Building, MapPin, X, Users, Phone, Filter, Save } from 'lucide-react';
import type { Employee } from '../types';
import { FilterManager, SavedFilter } from '../components/FilterManager';

export function EmployeesPage() {
  const { employees, addEmployee, departments, positions, branches } = useDataStore();
  const { canEdit } = useAuthStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    const saved = localStorage.getItem('employees-filters');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('employees-filters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  const currentFilters = { searchQuery, filterDepartment, filterPosition, filterBranch, filterStatus };

  const handleSaveFilter = (name: string, filters: Record<string, any>) => {
    const newFilter: SavedFilter = { id: Date.now().toString(), name, filters };
    setSavedFilters([...savedFilters, newFilter]);
  };

  const handleLoadFilter = (filters: Record<string, any>) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.filterDepartment !== undefined) setFilterDepartment(filters.filterDepartment);
    if (filters.filterPosition !== undefined) setFilterPosition(filters.filterPosition);
    if (filters.filterBranch !== undefined) setFilterBranch(filters.filterBranch);
    if (filters.filterStatus !== undefined) setFilterStatus(filters.filterStatus);
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== id));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterDepartment('');
    setFilterPosition('');
    setFilterBranch('');
    setFilterStatus('all');
  };

  const getPosName = (id: string) => positions.find(p => p.id === id)?.name || '—';
  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || '—';
  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || '—';

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = `${emp.lastName} ${emp.firstName} ${emp.middleName} ${getPosName(emp.positionId)} ${emp.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = !filterDepartment || emp.departmentId === filterDepartment;
    const matchesPosition = !filterPosition || emp.positionId === filterPosition;
    const matchesBranch = !filterBranch || emp.branchId === filterBranch;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' && emp.isEmployed) || (filterStatus === 'inactive' && !emp.isEmployed);
    return matchesSearch && matchesDepartment && matchesPosition && matchesBranch && matchesStatus;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Сотрудники</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Полный список сотрудников организации ({employees.length})</p>
        </div>
        {canEdit() && (
          <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />Добавить сотрудника
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Фильтры</span>
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск по ФИО, должности, email..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
          </div>
          <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все отделы</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все должности</option>
            {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="all">Все статусы</option>
            <option value="active">Работающие</option>
            <option value="inactive">Уволенные</option>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredEmployees.map(employee => (
          <div key={employee.id} onClick={() => navigate(`/employees/${employee.id}`)} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-600 transition-all cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold ${employee.isEmployed ? 'bg-indigo-500' : 'bg-gray-400'}`}>{employee.lastName.charAt(0)}{employee.firstName.charAt(0)}</div>
                <div>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-200">{employee.lastName} {employee.firstName}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{getPosName(employee.positionId)}</p>
                </div>
              </div>
              {employee.isEmployed ? <UserCheck className="w-5 h-5 text-green-500" /> : <UserX className="w-5 h-5 text-red-400" />}
            </div>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2"><Building className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{getDeptName(employee.departmentId)}</span></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.email}</span></div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.workPhone} {employee.internalPhone && `(вн. ${employee.internalPhone})`}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{getBranchName(employee.branchId)}{employee.room && `, каб. ${employee.room}`}</span></div>
            </div>
          </div>
        ))}
      </div>

      {filteredEmployees.length === 0 && <div className="text-center py-12 text-gray-500 dark:text-gray-400"><Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" /><p>Сотрудники не найдены</p></div>}

      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onAdd={(data) => addEmployee(data as any)} />}
    </div>
  );
}

function AddEmployeeModal({ onClose, onAdd }: { onClose: () => void; onAdd: (data: any) => void }) {
  const { departments, positions, branches } = useDataStore();
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', middleName: '', positionId: '', departmentId: '', email: '',
    workPhone: '', internalPhone: '', personalPhone: '', hireDate: new Date().toISOString().split('T')[0],
    isEmployed: true, branchId: '', floor: '', room: '', notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onAdd(formData); onClose(); };
  const handleChange = (field: string, value: string | boolean) => { setFormData(prev => ({ ...prev, [field]: value })); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">Добавить сотрудника</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Фамилия<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Отчество</label><input type="text" value={formData.middleName} onChange={(e) => handleChange('middleName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Должность<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><select value={formData.positionId} onChange={(e) => handleChange('positionId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required><option value="">Выберите должность</option>{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Отдел<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><select value={formData.departmentId} onChange={(e) => handleChange('departmentId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required><option value="">Выберите отдел</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label><input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Рабочий телефон</label><input type="text" value={formData.workPhone} onChange={(e) => handleChange('workPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Внутренний номер</label><input type="text" value={formData.internalPhone} onChange={(e) => handleChange('internalPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="1001" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Личный телефон</label><input type="text" value={formData.personalPhone} onChange={(e) => handleChange('personalPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата приёма</label><input type="date" value={formData.hireDate} onChange={(e) => handleChange('hireDate', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал</label><select value={formData.branchId} onChange={(e) => handleChange('branchId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"><option value="">Выберите филиал</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Этаж</label><input type="text" value={formData.floor} onChange={(e) => handleChange('floor', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет</label><input type="text" value={formData.room} onChange={(e) => handleChange('room', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="isEmployed" checked={formData.isEmployed} onChange={(e) => handleChange('isEmployed', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="isEmployed" className="text-sm text-gray-700 dark:text-gray-300">Работает в организации</label></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Добавить</button>
          </div>
        </form>
      </div>
    </div>
  );
}
