import { useState, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import {
  Search, Plus, Monitor, Server, Armchair, MousePointerClick, Network, Phone, Package,
  X, Edit, Trash2, Cpu, Clock, User, History, Filter, Save, HardDrive,
} from 'lucide-react';
import type { Equipment, EquipmentCategory } from '../types';
import { api } from '../api/client';
import { FullHistoryModal, useEntityHistory } from '../components/HistoryLog';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { FilterManager, SavedFilter } from '../components/FilterManager';
import { serverRoleVisual } from '../components/ServerRoleIcon';
import { statusLabels, DEFAULT_EQUIPMENT_STATUS, statusRequiresDefect } from '../utils/equipmentStatus';
import { formatDate } from '../utils/formatDate';
import { MissingFieldsBanner } from '../utils/modalValidation';

const categoryLabels: Record<EquipmentCategory, string> = {
  computer: 'Компьютеры', monitor: 'Мониторы', peripheral: 'Периферия', furniture: 'Мебель',
  server: 'Серверы', storage: 'СХД', virtual_machine: 'Виртуальные машины', network: 'Сетевое оборудование',
  phone: 'Телефоны', other: 'Прочее',
};

const categoryIcons: Record<EquipmentCategory, React.ElementType> = {
  computer: Monitor, monitor: Monitor, peripheral: MousePointerClick, furniture: Armchair,
  server: Server, storage: HardDrive, virtual_machine: Cpu, network: Network, phone: Phone, other: Package,
};

// Статусная модель оборудования — общий справочник src/utils/equipmentStatus.ts
// (в UI поле «Состояние» переименовано в «Статус»).

/** Только актуальные статусы (для фильтров и форм; старые значения истории не предлагаются). */
const ACTIVE_STATUS_KEYS = ['exploitation', 'exploitation_restricted', 'reserve', 'repair', 'removed_from_register', 'lost_stolen', 'unfit', 'for_writeoff'] as const;
const activeStatusLabels: Record<string, { label: string; color: string }> = Object.fromEntries(
  ACTIVE_STATUS_KEYS.map((k) => [k, statusLabels[k]]),
);

export function EquipmentPage() {
  const { equipment, employees, branches, addEquipment, updateEquipment, deleteEquipment } = useDataStore();
  const { canManageEmployees, canAddEquipment, canManageServers, users, currentUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'assigned' | 'unassigned'>('all');
  // Фильтр по МОЛ: '' — все; 'me' — подотчётное текущему сотруднику; иначе id конкретного сотрудника
  const [filterMol, setFilterMol] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Equipment | null>(null);

  // История изменений подгружается с сервера при открытии (GET /equipment/:id/history)
  // и мгновенно обновляется ВЕЗДЕ после любого сохранения (useEntityHistory).
  const { history: fullHistory } = useEntityHistory(viewingHistory ? `/equipment/${viewingHistory.id}/history` : null);
  function openHistory(eq: Equipment) {
    setViewingHistory(eq);
  }
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    const saved = localStorage.getItem('equipment-filters');
    return saved ? JSON.parse(saved) : [];
  });

  // Сохраняем фильтры в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('equipment-filters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  const currentFilters = {
    searchQuery,
    filterCategory,
    filterCondition,
    filterAssignment,
    filterMol,
  };

  const handleSaveFilter = (name: string, filters: Record<string, any>) => {
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name,
      filters,
    };
    setSavedFilters([...savedFilters, newFilter]);
  };

  const handleLoadFilter = (filters: Record<string, any>) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.filterCategory !== undefined) setFilterCategory(filters.filterCategory);
    if (filters.filterCondition !== undefined) setFilterCondition(filters.filterCondition);
    if (filters.filterAssignment !== undefined) setFilterAssignment(filters.filterAssignment);
    if (filters.filterMol !== undefined) setFilterMol(filters.filterMol);
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== id));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterCondition('');
    setFilterAssignment('all');
    setFilterMol('');
  };

  // Иерархия видимости оборудования (сервер уже фильтрует /equipment, здесь — зеркало):
  // обычный сотрудник видит только закреплённое за ним, начальник отдела — всё
  // оборудование своих подчинённых и своё, отдел «Руководство» — всё оборудование организации.
  const vis = currentUser?.equipmentVisibility;
  const visibleEquipment = vis && !vis.all
    ? equipment.filter((eq) => {
        const ids = new Set(vis.employeeIds ?? []);
        return (eq.assignedToEmployeeId && ids.has(eq.assignedToEmployeeId)) ||
               (eq.materiallyResponsibleEmployeeId && ids.has(eq.materiallyResponsibleEmployeeId));
      })
    : equipment;

  // Список сотрудников для фильтра по МОЛ: только те, кто числится МОЛ за каким-либо
  // оборудованием (плюс текущий пользователь — быстрый доступ к подотчётному ему).
  const molEmployeeIds = new Set(
    visibleEquipment.map((eq) => eq.materiallyResponsibleEmployeeId).filter(Boolean) as string[]
  );
  if (currentUser?.employee?.id) molEmployeeIds.add(currentUser.employee.id);
  const molEmployees = employees.filter((e) => molEmployeeIds.has(e.id));
  const empFullName = (e: { lastName: string; firstName: string; middleName?: string }) =>
    [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

  const filteredEquipment = visibleEquipment.filter((eq) => {
    const matchesSearch =
      `${eq.name} ${eq.brand} ${eq.model} ${eq.serialNumber} ${eq.inventoryNumber}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    const matchesCategory = !filterCategory || eq.category === filterCategory;
    const matchesCondition = !filterCondition || eq.condition === filterCondition;
    const matchesAssignment =
      filterAssignment === 'all' ||
      (filterAssignment === 'assigned' && eq.assignedToEmployeeId) ||
      (filterAssignment === 'unassigned' && !eq.assignedToEmployeeId);
    // Фильтр по МОЛ: показать только подотчётное оборудование выбранного сотрудника
    const molId = filterMol === 'me' ? (currentUser?.employee?.id ?? '') : filterMol;
    const matchesMol = !filterMol || (molId ? eq.materiallyResponsibleEmployeeId === molId : true);
    return matchesSearch && matchesCategory && matchesCondition && matchesAssignment && matchesMol;
  });

  const getEmployeeName = (id: string | null) => {
    if (!id) return 'Не закреплено';
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.lastName} ${emp.firstName}` : 'Неизвестный';
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return '—';
    const user = users.find(u => u.id === userId);
    return user?.fullName || 'Система';
  };

  const getBranchName = (id: string | null | undefined) => {
    if (!id) return '—';
    const branch = branches.find((b) => b.id === id);
    return branch?.name || '—';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Техника и имущество</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Управление оборудованием и имуществом организации</p>
        </div>
        {canAddEquipment() && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-5 h-5" />
            Добавить
          </button>
        )}
      </div>

      {/* Filters */}
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
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию, бренду, серийному/инвентарному номеру..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все категории</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={filterCondition} onChange={(e) => setFilterCondition(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все статусы</option>
            {Object.entries(activeStatusLabels).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={filterAssignment} onChange={(e) => setFilterAssignment(e.target.value as 'all' | 'assigned' | 'unassigned')} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="all">Все</option>
            <option value="assigned">Закреплённые</option>
            <option value="unassigned">Свободные</option>
          </select>
          {/* Фильтр по МОЛ: материально ответственные могут оставить только подотчётное им оборудование */}
          <select value={filterMol} onChange={(e) => setFilterMol(e.target.value)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" title="Материально ответственное лицо — показать подотчётное оборудование">
            <option value="">МОЛ: все</option>
            {currentUser?.employee?.id && (
              <option value="me">МОЛ: моё подотчётное</option>
            )}
            {molEmployees.map((e) => (
              <option key={e.id} value={e.id}>{empFullName(e)}</option>
            ))}
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

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Наименование</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Серийный №</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Инв. №</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Сост.</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Закреплено за</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400" title="Материально ответственное лицо — сотрудник, на подотчёте которого числится оборудование">МОЛ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Обновлено</th>
                {canManageEmployees() && <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredEquipment.map((eq) => {
                // Для серверных сущностей (хост/кластер/СХД/консоль) красим иконку по роли —
                // так же, как в «Физических серверах» и «Платформе виртуализации».
                const roleVisual = eq.serverRole ? serverRoleVisual(eq.serverRole) : null;
                const Icon = roleVisual ? roleVisual.Icon : categoryIcons[eq.category];
                const iconBoxClass = roleVisual
                  ? `${roleVisual.bg} p-2 rounded-lg`
                  : 'bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg';
                const iconColorClass = roleVisual ? roleVisual.color : 'text-indigo-600 dark:text-indigo-400';
                const condition = statusLabels[eq.condition] ?? { label: eq.condition, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr
                    key={eq.id}
                    onClick={() => canManageEmployees() && setEditingEquipment(eq)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${canManageEmployees() ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={iconBoxClass}><Icon className={`w-4 h-4 ${iconColorClass}`} /></div>
                        <div>
                          <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">{eq.name}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{eq.brand} {eq.model}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{eq.serialNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{eq.inventoryNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${condition.color}`}>{condition.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getEmployeeName(eq.assignedToEmployeeId)}</td>
                    {/* МОЛ: у кластера (логическая сущность) МОЛ не бывает — показываем прочерк */}
                    <td className="px-4 py-3 text-sm text-gray-600">{eq.serverRole === 'cluster' ? '—' : eq.materiallyResponsibleEmployee ? `${eq.materiallyResponsibleEmployee.lastName} ${eq.materiallyResponsibleEmployee.firstName}` : eq.materiallyResponsibleEmployeeId ? getEmployeeName(eq.materiallyResponsibleEmployeeId) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500">
                        <p>{formatDate(eq.updatedAt)}</p>
                        <p className="text-gray-400">{getUserName(eq.updatedBy)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={(e) => { e.stopPropagation(); openHistory(eq); }} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1" title="История изменений"><History className="w-4 h-4" /></button>
                        {canManageEmployees() && (
                          <button onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }} className="text-gray-400 hover:text-indigo-600 p-1" title="Редактировать"><Edit className="w-4 h-4" /></button>
                        )}
                        {/* Удаление оборудования на бэкенде: SERVER_ROLES (admin|sysadmin) */}
                        {canManageServers() && (
                          <button onClick={(e) => { e.stopPropagation(); if (confirm('Удалить запись?')) deleteEquipment(eq.id); }} className="text-gray-400 hover:text-red-600 p-1" title="Удалить"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredEquipment.length === 0 && (
          <div className="text-center py-12 text-gray-500"><Monitor className="w-12 h-12 mx-auto mb-3 text-gray-300" /><p>Оборудование не найдено</p></div>
        )}
      </div>

      {(showAddModal || editingEquipment) && (
        <EquipmentModalWrapper
          equipment={editingEquipment}
          onClose={() => { setShowAddModal(false); setEditingEquipment(null); }}
        />
      )}

      {/* Модалка ПОЛНОЙ истории изменений оборудования: сверху вниз,
          самые свежие записи вверху. */}
      {viewingHistory && (
        <FullHistoryModal
          history={fullHistory}
          title={`История изменений: ${viewingHistory.name}`}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </div>
  );
}

function EquipmentModal({
  equipment, branches, onClose, onSave,
}: {
  equipment: Equipment | null;
  branches: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: Partial<Equipment>) => Promise<boolean>;
}) {
  // Текст ошибки сервера (уникальность номеров и т.п.) — показываем баннером в модалке
  const storeError = useDataStore((s) => s.error);
  const [formData, setFormData] = useState<Partial<Equipment>>(
    equipment || {
      name: '', category: 'computer', serialNumber: '', inventoryNumber: '',
      brand: '', model: '', purchaseDate: new Date().toISOString().split('T')[0], writeOffDate: null,
      condition: DEFAULT_EQUIPMENT_STATUS, defectNote: '', assignedToEmployeeId: null, materiallyResponsibleEmployeeId: null, branchId: '', floor: '', room: '', notes: '',
    }
  );
  // Внутренняя валидация модалки: подсветка обязательных полей + баннер ошибок
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const vErr = (f: string) => submitted && !String(formData[f as keyof Equipment] ?? '').trim();
  const vCls = (f: string) => `w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${vErr(f) ? 'border-red-400 dark:border-red-600 focus:ring-red-400' : 'border-gray-200 dark:border-gray-600 focus:ring-indigo-500'}`;
  const vHint = (f: string, msg: string) => vErr(f) ? <p className="text-xs text-red-500 mt-1">{msg}</p> : null;

  // Кластер — логическая сущность (совокупность оборудования и консоли управления):
  // у него нет МОЛ, инвентарного и серийного номера. Поля скрываем и обнуляем.
  const isClusterEdit = (equipment as any)?.serverRole === 'cluster';

  const needsDefect = statusRequiresDefect(formData.condition);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // Косяк из примера пользователя: «Создать» закрывал окно без сохранения.
    // Теперь: внутренняя проверка обязательных полей + await сохранения,
    // закрытие — только если сущность реально создана/обновлена (см. onSave в родителе).
    const missing: string[] = [];
    if (!formData.name?.trim()) missing.push('Наименование');
    if (!isClusterEdit && !formData.serialNumber?.trim()) missing.push('Серийный номер');
    if (!isClusterEdit && !formData.inventoryNumber?.trim()) missing.push('Инвентарный номер');
    if (needsDefect && !String(formData.defectNote ?? '').trim()) missing.push('Дефект / причина ограничений');
    if (missing.length > 0) { setSubmitted(true); return; } // окно остаётся открытым с подсветкой полей
    setSubmitted(false);
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSave(isClusterEdit ? { ...formData, materiallyResponsibleEmployeeId: null } : formData);
      // ok === false — сервер НЕ создал/не обновил сущность: окно остаётся открытым
      if (ok === false) setSaveError(storeError || 'Не удалось сохранить оборудование: сервер отклонил запрос. Проверьте уникальность серийного/инвентарного номеров и доступ к организации. Окно осталось открытым — введённые данные сохранены в форме.');
    } catch (err: any) {
      setSaveError(err?.message || 'Не удалось сохранить оборудование. Окно осталось открытым — данные сохранены в форме.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{equipment ? 'Редактировать' : 'Добавить оборудование'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} className={vCls('name')} />
              {vHint('name', 'Укажите наименование оборудования — без него карточка не создаётся.')}
            </div>
            <div className="md:col-span-2">
              <EmployeeSearch
                value={formData.assignedToEmployeeId || null}
                onChange={(id) => handleChange('assignedToEmployeeId', id)}
                label="Закреплено за сотрудником"
                placeholder="Поиск сотрудника..."
              />
            </div>
            {/* МОЛ — только для физической техники: у кластера (логическая сущность) его не бывает */}
            {!isClusterEdit && (
              <div className="md:col-span-2">
                <EmployeeSearch
                  value={formData.materiallyResponsibleEmployeeId || null}
                  onChange={(id) => handleChange('materiallyResponsibleEmployeeId', id)}
                  label="МОЛ (материально ответственное лицо)"
                  placeholder="Сотрудник, на подотчёте которого числится оборудование..."
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория *</label>
              <select value={formData.category || 'computer'} onChange={(e) => handleChange('category', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {Object.entries(categoryLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Статус</label>
              <select value={formData.condition || DEFAULT_EQUIPMENT_STATUS} onChange={(e) => handleChange('condition', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {Object.entries(activeStatusLabels).map(([key, { label }]) => (<option key={key} value={key}>{label}</option>))}
              </select>
            </div>
            {needsDefect && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дефект / причина ограничений *</label>
                <textarea value={formData.defectNote || ''} onChange={(e) => handleChange('defectNote', e.target.value)} rows={2} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${vErr('defectNote') ? 'border-red-400 dark:border-red-600 focus:ring-red-400' : 'border-yellow-300 dark:border-yellow-600 focus:ring-yellow-500'}`} placeholder="Обязательно при статусе «Эксплуатация с ограничениями»" />
                {vHint('defectNote', 'Для статуса «Эксплуатация с ограничениями» обязательно укажите дефект или причину ограничений.')}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Серийный номер *</label>
              <input type="text" value={formData.serialNumber || ''} onChange={(e) => handleChange('serialNumber', e.target.value)} className={vCls('serialNumber')} placeholder="Уникальный серийный номер" />
              {vHint('serialNumber', 'Укажите серийный номер — он уникален и участвует в поиске инвентаря.')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Инвентарный номер *</label>
              <input type="text" value={formData.inventoryNumber || ''} onChange={(e) => handleChange('inventoryNumber', e.target.value)} className={vCls('inventoryNumber')} placeholder="INV-XXX-001" />
              {vHint('inventoryNumber', 'Укажите инвентарный номер — без него объект учёта не создаётся.')}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Бренд</label>
              <input type="text" value={formData.brand || ''} onChange={(e) => handleChange('brand', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Модель</label>
              <input type="text" value={formData.model || ''} onChange={(e) => handleChange('model', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата покупки</label>
              <input type="date" value={formData.purchaseDate || ''} onChange={(e) => handleChange('purchaseDate', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал</label>
              <select value={formData.branchId || ''} onChange={(e) => handleChange('branchId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                <option value="">Не указан</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Этаж</label>
              <input type="text" value={formData.floor || ''} onChange={(e) => handleChange('floor', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет</label>
              <input type="text" value={formData.room || ''} onChange={(e) => handleChange('room', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label>
            <textarea value={formData.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} />
          </div>
          {/* Баннеры: список дозаполняемых полей + ошибка сохранения.
              Кнопка «Добавить/Сохранить» НЕ закрывает окно, пока сущность реально
              не создана на сервере (см. handleSubmit/onSave). */}
          {submitted && (
            <MissingFieldsBanner
              missing={[
                ...(!formData.name?.trim() ? ['Наименование'] : []),
                ...(!isClusterEdit && !formData.serialNumber?.trim() ? ['Серийный номер'] : []),
                ...(!isClusterEdit && !formData.inventoryNumber?.trim() ? ['Инвентарный номер'] : []),
                ...(needsDefect && !String(formData.defectNote ?? '').trim() ? ['Дефект / причина ограничений'] : []),
              ]}
            />
          )}
          {saveError && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Сохранение…' : equipment ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Публичная форма оборудования (используется и на странице, и из модалки
// карточки оборудования): данные берёт из store, сохранение — через add/updateEquipment.
export function EquipmentModalWrapper({ equipment, onClose }: { equipment: Equipment | null; onClose: () => void }) {
  const { branches, addEquipment, updateEquipment } = useDataStore();
  return (
    <EquipmentModal
      equipment={equipment}
      branches={branches}
      onClose={onClose}
      onSave={async (data: any) => {
        // Дожидаемся реального результата сохранения: модалка закрывается
        // ТОЛЬКО если сущность создана/обновлена на сервере.
        return equipment ? await updateEquipment(equipment.id, data) : await addEquipment(data);
      }}
    />
  );
}

