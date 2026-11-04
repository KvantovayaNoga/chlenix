import { useState, useEffect } from 'react';
import { useNavigate } from '../router';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { Search, Plus, UserCheck, UserX, Mail, Building, MapPin, X, Users, Phone, Filter, Save, Pencil, Cake, Link2 } from 'lucide-react';
import type { Employee, User, Organization } from '../types';
import { api } from '../api/client';
import { FilterManager, SavedFilter } from '../components/FilterManager';

// Единый формат даты по проекту: DD-MM-YYYY (см. utils/formatDate)
import { formatDate, formatDateTime } from '../utils/formatDate';
import { HeadStar } from '../components/HeadStar';

export function fmtRuDate(iso?: string | null): string {
  return formatDate(iso);
}

export function EmployeesPage() {
  const { employees, addEmployee, updateEmployee, departments, positions, branches, error } = useDataStore();
  const { canManageEmployees } = useAuthStore();
  const navigate = useNavigate();
  // Данные учётных записей (для столбца «Организация»): id пользователя -> организации
  const [userOrgsMap, setUserOrgsMap] = useState<Map<string, User>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    const saved = localStorage.getItem('employees-filters');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('employees-filters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  // Столбец «Организация»: подтягиваем учётные записи (актуальная организация
  // из последней сессии + все организации пользователя)
  useEffect(() => {
    api.get<User[]>('/users').then((list) => {
      setUserOrgsMap(new Map(list.map((u) => [u.id, u])));
    }).catch(() => {});
  }, []);

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

  // Организация сотрудника: актуальная (из последней сессии привязанной учётной записи)
  const getEmpOrg = (emp: Employee): { name: string | null; total: number } => {
    const acc = emp.userId ? userOrgsMap.get(emp.userId) : undefined;
    // Организация карточки приоритетна (её можно выбрать в редактировании);
    // если карточка без организации — актуальная организация учётной записи.
    const ownName = emp.organization?.shortName || emp.organization?.name || emp.userOrganization?.organizationName || null;
    if (!acc) return { name: ownName, total: 0 };
    return {
      name: ownName || acc.organizationName || null,
      total: acc.organizations?.length ?? 0,
    };
  };

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
        {canManageEmployees() && (
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
                <div className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-bold ${employee.avatar ? '' : (employee.isEmployed ? 'bg-indigo-500' : 'bg-gray-400')}`}>
                  {employee.avatar
                    ? <img src={employee.avatar} alt="" className="w-full h-full object-cover" />
                    : <>{employee.lastName.charAt(0)}{employee.firstName.charAt(0)}</>}
                </div>
                <div>
                  {/* п.4: полное ФИО (Фамилия Имя Отчество); золотая звёздочка — руководитель организации */}
                  <h3 className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
                    {employee.isHeadEmployee && <HeadStar />}
                    {[employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(' ')}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{getPosName(employee.positionId)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManageEmployees() && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingEmployee(employee); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                    title="Редактировать сотрудника"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {employee.isEmployed ? <UserCheck className="w-5 h-5 text-green-500" /> : <UserX className="w-5 h-5 text-red-400" />}
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              {(() => { const org = getEmpOrg(employee); return (
                <div className="flex items-center gap-2" title={org.total > 1 ? `Всего организаций: ${org.total}` : undefined}>
                  <Building className="w-4 h-4 text-indigo-400 dark:text-indigo-500 shrink-0" />
                  <span className="truncate">{org.name || 'Организация не указана'}</span>
                  {org.total > 1 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 shrink-0">+{org.total - 1}</span>}
                </div>
              ); })()}
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.email}</span></div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.workPhone} {employee.internalPhone && `(вн. ${employee.internalPhone})`}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{getBranchName(employee.branchId)}{employee.room && `, каб. ${employee.room}`}</span></div>
            </div>
          </div>
        ))}
      </div>

      {filteredEmployees.length === 0 && <div className="text-center py-12 text-gray-500 dark:text-gray-400"><Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" /><p>Сотрудники не найдены</p></div>}

      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onAdd={(data) => addEmployee(data as any)} />}
      {editingEmployee && (
        <AddEmployeeModal
          initial={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onAdd={(data) => updateEmployee(editingEmployee.id, data as any)}
        />
      )}
    </div>
  );
}

export function AddEmployeeModal({ onClose, onAdd, initial }: { onClose: () => void; onAdd: (data: any) => Promise<boolean> | boolean; initial?: Employee | null }) {
  const { departments, positions, branches } = useDataStore();
  const { getUserRole } = useAuthStore();
  // п.1: список пользователей для привязки сотрудника к учётной записи
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api.get<User[]>('/users').then(setUsers).catch(() => setUsers([])); }, []);
  // Привязка сотрудника к организации: доступна администратору и HR.
  // Справочники (должность/отдел/филиал) отдаются сервером в скоупе активной
  // организации, поэтому выбираем организацию из списка доступных пользователю.
  const role = getUserRole();
  const canPickOrg = role === 'admin' || role === 'hr_specialist';
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    if (!canPickOrg) return;
    api.get<Organization[]>('/organizations').then(setOrgs).catch(() => setOrgs([]));
  }, [canPickOrg]);
  const [formData, setFormData] = useState(() => initial ? ({
    firstName: initial.firstName ?? '', lastName: initial.lastName ?? '', middleName: initial.middleName ?? '',
    positionId: initial.positionId ?? '', departmentId: initial.departmentId ?? '', email: initial.email ?? '',
    workPhone: initial.workPhone ?? '', internalPhone: initial.internalPhone ?? '', personalPhone: initial.personalPhone ?? '',
    hireDate: initial.hireDate ? initial.hireDate.slice(0, 10) : new Date().toISOString().split('T')[0],
    birthDate: initial.birthDate ? initial.birthDate.slice(0, 10) : '',
    userId: initial.userId ?? '',
    organizationId: initial.organizationId ?? '',
    isEmployed: initial.isEmployed ?? true, branchId: initial.branchId ?? '', floor: initial.floor ?? '', room: initial.room ?? '', notes: initial.notes ?? '',
  }) : {
    firstName: '', lastName: '', middleName: '', positionId: '', departmentId: '', email: '',
    workPhone: '', internalPhone: '', personalPhone: '', hireDate: new Date().toISOString().split('T')[0],
    birthDate: '', userId: '',
    organizationId: '',
    isEmployed: true, branchId: '', floor: '', room: '', notes: '',
  });

  // п.5: локальная валидация — не закрываем форму, если что-то заполнено неверно
  const errors: Record<string, string> = {};
  if (!formData.lastName.trim()) errors.lastName = 'Укажите фамилию';
  if (!formData.firstName.trim()) errors.firstName = 'Укажите имя';
  if (!formData.positionId) errors.positionId = 'Выберите должность';
  if (!formData.departmentId) errors.departmentId = 'Выберите отдел';
  if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim())) errors.email = 'Некорректный e-mail (пример: ivan@example.ru)';
  if (formData.birthDate) {
    const bd = new Date(formData.birthDate);
    if (Number.isNaN(bd.getTime()) || bd > new Date()) errors.birthDate = 'Дата в будущем или некорректна';
  }
  if (formData.hireDate && new Date(formData.hireDate) > new Date()) errors.hireDate = 'Дата приёма не может быть в будущем';
  const hasErrors = Object.keys(errors).length > 0;
  const errCls = (f: string) => ` w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${errors[f] ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 dark:border-gray-600 focus:ring-indigo-500'}`;
  const errHint = (f: string) => errors[f] ? <p className="text-xs text-red-500 mt-1">{errors[f]}</p> : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return; // форма остаётся открытой — показываем подсказки внутри полей
    const payload: any = { ...formData, birthDate: formData.birthDate || null, userId: formData.userId || null };
    // При редактировании пустое значение = «Без организации» (явная отвязка) —
    // отправляем null только если карточка была привязана; иначе «без изменений».
    if (payload.organizationId === '' && initial && !initial.organizationId) delete payload.organizationId;
    else if (payload.organizationId === '') payload.organizationId = null;
    const res = await onAdd(payload);
    if (res !== false) onClose();
  };
  const handleChange = (field: string, value: string | boolean) => { setFormData(prev => ({ ...prev, [field]: value })); };

  return (
    <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{initial ? 'Редактировать сотрудника' : 'Добавить сотрудника'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Фамилия<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} className={errCls('lastName')} />{errHint('lastName')}</div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} className={errCls('firstName')} />{errHint('firstName')}</div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Отчество</label><input type="text" value={formData.middleName} onChange={(e) => handleChange('middleName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Должность<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><select value={formData.positionId} onChange={(e) => handleChange('positionId', e.target.value)} className={errCls('positionId')}><option value="">Выберите должность</option>{positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{errHint('positionId')}</div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Отдел<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><select value={formData.departmentId} onChange={(e) => handleChange('departmentId', e.target.value)} className={errCls('departmentId')}><option value="">Выберите отдел</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{errHint('departmentId')}</div>
          </div>
          {/* Привязка сотрудника к организации — доступна администратору и HR.
              Пустое значение ('') = «Без организации» (для новых — активная организация). */}
          {canPickOrg ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"><Building className="w-3.5 h-3.5 inline mr-1 text-gray-400" />Организация</label>
              <select value={formData.organizationId} onChange={(e) => handleChange('organizationId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {initial
                  ? <>
                      {/* «Без организации» доступно только если карточка уже привязана — иначе это «без изменений» */}
                      {initial.organizationId
                        ? <option value="">Без организации</option>
                        : <option value="" disabled hidden>Без организации</option>}
                    </>
                  : <option value="">Без организации (по умолчанию — текущая активная)</option>}
                {orgs.map(o => <option key={o.id} value={o.id}>{o.shortName || o.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{initial
                ? `Сейчас: ${initial.organizationId
                    ? (orgs.find(o => o.id === initial.organizationId)?.shortName || orgs.find(o => o.id === initial.organizationId)?.name || 'организация вне списка доступных')
                    : 'без организации'}. Выберите другую, чтобы перенести карточку, или «Без организации», чтобы отвязать.`
                : 'Карточка будет создана в активной организации; выберите другую, если нужно.'}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label><input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="ivan@example.ru" className={errCls('email')} />{errHint('email')}{!errors.email && formData.email && users.some(u => u.email.toLowerCase() === formData.email.trim().toLowerCase()) ? <p className="text-xs text-emerald-600 mt-1">Найдена учётная запись с таким e-mail — привяжется автоматически</p> : null}</div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"><Link2 className="w-3.5 h-3.5 inline mr-1 text-gray-400" />Пользователь (привязка)</label>
              <select value={formData.userId} onChange={(e) => handleChange('userId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                <option value="">Не привязан (или авто по e-mail)</option>
                {users.filter(u => !u.isActive).map(u => <option key={u.id} value={u.id}>{u.fullName} — неактивен</option>)}
                {users.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Если не выбран — привяжем автоматически по совпадению e-mail; аватар пользователя будет синхронизироваться сюда.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Рабочий телефон</label><input type="text" value={formData.workPhone} onChange={(e) => handleChange('workPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Внутренний номер</label><input type="text" value={formData.internalPhone} onChange={(e) => handleChange('internalPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="1001" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Личный телефон</label><input type="text" value={formData.personalPhone} onChange={(e) => handleChange('personalPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            {/* п.3: день рождения, отображается в формате дд.мм.гггг */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"><Cake className="w-3.5 h-3.5 inline mr-1 text-gray-400" />День рождения</label>
              <input type="date" value={formData.birthDate} onChange={(e) => handleChange('birthDate', e.target.value)} className={errCls('birthDate')} />
              {errHint('birthDate')}
              {formData.birthDate && !errors.birthDate ? <p className="text-xs text-gray-400 mt-1">{fmtRuDate(formData.birthDate)}</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата приёма</label><input type="date" value={formData.hireDate} onChange={(e) => handleChange('hireDate', e.target.value)} className={errCls('hireDate')} />{errHint('hireDate')}</div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал</label><select value={formData.branchId} onChange={(e) => handleChange('branchId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"><option value="">Выберите филиал</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Этаж</label><input type="text" value={formData.floor} onChange={(e) => handleChange('floor', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет</label><input type="text" value={formData.room} onChange={(e) => handleChange('room', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="isEmployed" checked={formData.isEmployed} onChange={(e) => handleChange('isEmployed', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="isEmployed" className="text-sm text-gray-700 dark:text-gray-300">Работает в организации</label></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{initial ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
