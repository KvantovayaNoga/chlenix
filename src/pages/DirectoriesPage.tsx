import { useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { Building2, Briefcase, MapPin, Plus, Edit, Trash2, X } from 'lucide-react';
import type { Department, Position, Branch } from '../types';

export function DirectoriesPage() {
  const { departments, positions, branches, addDepartment, updateDepartment, deleteDepartment, addPosition, updatePosition, deletePosition, addBranch, updateBranch, deleteBranch } = useDataStore();
  const { canEdit } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'departments' | 'positions' | 'branches'>('departments');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const tabs = [
    { id: 'departments' as const, label: 'Отделы', icon: Building2, count: departments.length },
    { id: 'positions' as const, label: 'Должности', icon: Briefcase, count: positions.length },
    { id: 'branches' as const, label: 'Филиалы', icon: MapPin, count: branches.length },
  ];

  const handleAdd = () => {
    if (activeTab === 'departments') addDepartment({ name: '', description: '' });
    else if (activeTab === 'positions') addPosition({ name: '', description: '' });
    else addBranch({ name: '', address: '', description: '' });
    setShowAddModal(false);
  };

  const handleEdit = (item: any) => {
    if (activeTab === 'departments') updateDepartment(item.id, item);
    else if (activeTab === 'positions') updatePosition(item.id, item);
    else updateBranch(item.id, item);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    if (activeTab === 'departments') deleteDepartment(id);
    else if (activeTab === 'positions') deletePosition(id);
    else deleteBranch(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Справочники</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Управление отделами, должностями и филиалами</p>
        </div>
        {canEdit() && (
          <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />Добавить
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              <tab.icon className="w-5 h-5" />
              {tab.label}
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'departments' && (
            <div className="space-y-2">
              {departments.map(dept => (
                <div key={dept.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{dept.name}</p>
                      {dept.description && <p className="text-sm text-gray-600 dark:text-gray-400">{dept.description}</p>}
                    </div>
                  </div>
                  {canEdit() && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(dept)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(dept.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="space-y-2">
              {positions.map(pos => (
                <div key={pos.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{pos.name}</p>
                      {pos.description && <p className="text-sm text-gray-600 dark:text-gray-400">{pos.description}</p>}
                    </div>
                  </div>
                  {canEdit() && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(pos)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(pos.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'branches' && (
            <div className="space-y-2">
              {branches.map(branch => (
                <div key={branch.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{branch.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{branch.address}</p>
                    </div>
                  </div>
                  {canEdit() && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(branch)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(branch.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingItem) && (
        <DirectoryModal
          item={editingItem}
          type={activeTab}
          onClose={() => { setShowAddModal(false); setEditingItem(null); }}
          onSave={(data) => {
            if (editingItem) handleEdit({ ...editingItem, ...data });
            else handleAdd();
          }}
        />
      )}
    </div>
  );
}

function DirectoryModal({ item, type, onClose, onSave }: any) {
  const [formData, setFormData] = useState(item || { name: '', description: '', address: '' });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{item ? 'Редактировать' : 'Добавить'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
          {type === 'branches' && <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Адрес *</label><input type="text" value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>}
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label><textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={3} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{item ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
