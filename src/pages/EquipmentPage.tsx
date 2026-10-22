import { useState, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import {
  Search, Plus, Monitor, Server, Armchair, MousePointerClick, Network, Phone, Package,
  X, Edit, Trash2, Cpu, Clock, User, History, Filter, Save,
} from 'lucide-react';
import type { Equipment, EquipmentCategory } from '../types';
import { HistoryLog } from '../components/HistoryLog';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { FilterManager, SavedFilter } from '../components/FilterManager';

const categoryLabels: Record<EquipmentCategory, string> = {
  computer: 'Компьютеры', monitor: 'Мониторы', peripheral: 'Периферия', furniture: 'Мебель',
  server: 'Серверы', virtual_machine: 'Виртуальные машины', network: 'Сетевое оборудование',
  phone: 'Телефоны', other: 'Прочее',
};

const categoryIcons: Record<EquipmentCategory, React.ElementType> = {
  computer: Monitor, monitor: Monitor, peripheral: MousePointerClick, furniture: Armchair,
  server: Server, virtual_machine: Cpu, network: Network, phone: Phone, other: Package,
};

const conditionLabels = {
  new: { label: 'Новое', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  good: { label: 'Хорошее', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  satisfactory: { label: 'Удовл.', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  needs_repair: { label: 'Ремонт', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  written_off: { label: 'Списано', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};

export function EquipmentPage() {
  const { equipment, employees, addEquipment, updateEquipment, deleteEquipment } = useDataStore();
  const { canEdit, users } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Equipment | null>(null);
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
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== id));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterCondition('');
    setFilterAssignment('all');
  };

  const filteredEquipment = equipment.filter((eq) => {
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
    return matchesSearch && matchesCategory && matchesCondition && matchesAssignment;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Техника и имущество</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Управление оборудованием и имуществом организации</p>
        </div>
        {canEdit() && (
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
            <option value="">Все состояния</option>
            {Object.entries(conditionLabels).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={filterAssignment} onChange={(e) => setFilterAssignment(e.target.value as 'all' | 'assigned' | 'unassigned')} className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="all">Все</option>
            <option value="assigned">Закреплённые</option>
            <option value="unassigned">Свободные</option>
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
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Обновлено</th>
                {canEdit() && <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredEquipment.map((eq) => {
                const Icon = categoryIcons[eq.category];
                const condition = conditionLabels[eq.condition];
                return (
                  <tr
                    key={eq.id}
                    onClick={() => canEdit() && setEditingEquipment(eq)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${canEdit() ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg"><Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /></div>
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
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500">
                        <p>{new Date(eq.updatedAt).toLocaleDateString('ru-RU')}</p>
                        <p className="text-gray-400">{getUserName(eq.updatedBy)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setViewingHistory(eq); }} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1" title="История изменений"><History className="w-4 h-4" /></button>
                        {canEdit() && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }} className="text-gray-400 hover:text-indigo-600 p-1" title="Редактировать"><Edit className="w-4 h-4" /></button>
                            <button onClick={(e) => { e.stopPropagation(); if (confirm('Удалить запись?')) deleteEquipment(eq.id); }} className="text-gray-400 hover:text-red-600 p-1" title="Удалить"><Trash2 className="w-4 h-4" /></button>
                          </>
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
        <EquipmentModal
          equipment={editingEquipment}
          onClose={() => { setShowAddModal(false); setEditingEquipment(null); }}
          onSave={(data: any) => {
            if (editingEquipment) {
              updateEquipment(editingEquipment.id, data);
            } else {
              addEquipment(data);
            }
            setShowAddModal(false);
            setEditingEquipment(null);
          }}
        />
      )}

      {viewingHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingHistory(null)}>
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
              <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                <History className="w-6 h-6" />
                История изменений: {viewingHistory.name}
              </h2>
              <button onClick={() => setViewingHistory(null)} className="text-gray-400 hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <HistoryLog history={viewingHistory.history || []} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentModal({
  equipment, onClose, onSave,
}: {
  equipment: Equipment | null;
  onClose: () => void;
  onSave: (data: Partial<Equipment>) => void;
}) {
  const [formData, setFormData] = useState<Partial<Equipment>>(
    equipment || {
      name: '', category: 'computer', serialNumber: '', inventoryNumber: '',
      brand: '', model: '', purchaseDate: new Date().toISOString().split('T')[0], writeOffDate: null,
      condition: 'good', assignedToEmployeeId: null, branchId: '', floor: '', room: '', notes: '',
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{equipment ? 'Редактировать' : 'Добавить оборудование'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование *</label>
              <input type="text" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required />
            </div>
            <div className="md:col-span-2">
              <EmployeeSearch
                value={formData.assignedToEmployeeId || null}
                onChange={(id) => handleChange('assignedToEmployeeId', id)}
                label="Закреплено за сотрудником"
                placeholder="Поиск сотрудника..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория *</label>
              <select value={formData.category || 'computer'} onChange={(e) => handleChange('category', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {Object.entries(categoryLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Состояние</label>
              <select value={formData.condition || 'good'} onChange={(e) => handleChange('condition', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {Object.entries(conditionLabels).map(([key, { label }]) => (<option key={key} value={key}>{label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Серийный номер *</label>
              <input type="text" value={formData.serialNumber || ''} onChange={(e) => handleChange('serialNumber', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required placeholder="Уникальный серийный номер" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Инвентарный номер *</label>
              <input type="text" value={formData.inventoryNumber || ''} onChange={(e) => handleChange('inventoryNumber', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required placeholder="INV-XXX-001" />
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
              <input type="text" value={formData.branchId || ''} onChange={(e) => handleChange('branchId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="ID филиала" />
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
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{equipment ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
