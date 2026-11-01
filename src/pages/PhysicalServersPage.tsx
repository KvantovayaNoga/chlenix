import { useDataStore } from '../store/dataStore';
import { Server, Edit, Trash2, Plus, X, History } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { HistoryLog } from '../components/HistoryLog';
import type { Equipment, ServerRole } from '../types';
import { serverRoleLabels, serverRoleOptions, hypervisorSuggestions } from '../utils/virtualization';

export function PhysicalServersPage() {
  const { equipment, branches, addEquipment, updateEquipment, deleteEquipment, getVMsByHost } = useDataStore();
  const { canEdit, users } = useAuthStore();
  const navigate = useNavigate();
  const [editingServer, setEditingServer] = useState<Equipment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<Equipment | null>(null);

  // Серверы организации: категория «Сервер» или «СХД», либо любой единице
  // выставлена роль в системе виртуализации (хост/СХД/консоль управления).
  const servers = equipment.filter(eq => eq.category === 'server' || eq.category === ('storage' as any) || !!eq.serverRole);
  const getBranchName = (id: string) => {
    const branch = branches.find(b => b.id === id);
    return branch?.name || '—';
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
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Физические серверы</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Серверное оборудование организации</p>
        </div>
        {canEdit() && (
          <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />Добавить сервер
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {servers.map(server => {
          const vms = getVMsByHost(server.id);
          return (
            <div key={server.id} onClick={() => canEdit() && setEditingServer(server)} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-lg"><Server className="w-6 h-6 text-red-600 dark:text-red-400" /></div>
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      {server.name}
                      {server.serverRole && server.serverRole !== 'standalone' && (
                        <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${serverRoleLabels[server.serverRole].color}`}>
                          {serverRoleLabels[server.serverRole].label}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{server.brand} {server.model}</p>
                    {server.hypervisorName && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Гипервизор: {server.hypervisorName}</p>
                    )}
                  </div>
                </div>
                {canEdit() && (
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('Удалить?')) deleteEquipment(server.id); }} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Серийный №:</span><span className="font-mono text-xs text-gray-800 dark:text-gray-200">{server.serialNumber}</span></div>
                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Инвентарный №:</span><span className="font-mono text-xs text-gray-800 dark:text-gray-200">{server.inventoryNumber}</span></div>
                {server.cpuCores && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU:</span><span className="text-gray-800 dark:text-gray-200">{server.cpuCores} ядер</span></div>
                )}
                {server.ramGB && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">RAM:</span><span className="text-gray-800 dark:text-gray-200">{server.ramGB} ГБ</span></div>
                )}
                {server.diskGB && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Диск:</span><span className="text-gray-800 dark:text-gray-200">{server.diskGB} ГБ</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Расположение:</span><span className="text-gray-800 dark:text-gray-200">{getBranchName(server.branchId)} {server.room && `, ${server.room}`}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400">ВМ на сервере:</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/servers?host=${server.id}`);
                    }}
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline"
                  >
                    {vms.length}
                  </button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                Обновлено: {new Date(server.updatedAt).toLocaleString('ru-RU')} • {getUserName(server.updatedBy)}
              </div>
            </div>
          );
        })}
      </div>

      {(showAddModal || editingServer) && (
        <ServerModal
          server={editingServer}
          onClose={() => { setShowAddModal(false); setEditingServer(null); }}
          onSave={(data) => {
            if (editingServer) { updateEquipment(editingServer.id, data); }
            else {
              const category = data.serverRole === 'storage' ? 'storage' : 'server';
              addEquipment({ ...data, category } as any);
            }
            setShowAddModal(false); setEditingServer(null);
          }}
          branches={branches}
        />
      )}
    </div>
  );
}

function ServerModal({ server, onClose, onSave, branches }: any) {
  const [formData, setFormData] = useState({
    name: server?.name || '', serialNumber: server?.serialNumber || '', inventoryNumber: server?.inventoryNumber || '',
    brand: server?.brand || '', model: server?.model || '', purchaseDate: server?.purchaseDate || new Date().toISOString().split('T')[0],
    condition: server?.condition || 'good', assignedToEmployeeId: server?.assignedToEmployeeId || null,
    branchId: server?.branchId || '', floor: server?.floor || '', room: server?.room || '',
    cpuCores: server?.cpuCores || null, ramGB: server?.ramGB || null, diskGB: server?.diskGB || null,
    serverRole: (server?.serverRole || '') as ServerRole | '',
    hypervisorName: server?.hypervisorName || '',
    notes: server?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{server ? 'Редактировать сервер' : 'Добавить сервер'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Серийный номер *</label><input type="text" value={formData.serialNumber} onChange={(e) => setFormData(p => ({ ...p, serialNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Инвентарный номер *</label><input type="text" value={formData.inventoryNumber} onChange={(e) => setFormData(p => ({ ...p, inventoryNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Бренд</label><input type="text" value={formData.brand} onChange={(e) => setFormData(p => ({ ...p, brand: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Модель</label><input type="text" value={formData.model} onChange={(e) => setFormData(p => ({ ...p, model: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPU (ядер)</label><input type="number" value={formData.cpuCores || ''} onChange={(e) => setFormData(p => ({ ...p, cpuCores: e.target.value ? +e.target.value : null }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Например: 32" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RAM (ГБ)</label><input type="number" value={formData.ramGB || ''} onChange={(e) => setFormData(p => ({ ...p, ramGB: e.target.value ? +e.target.value : null }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Например: 128" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Диск (ГБ)</label><input type="number" value={formData.diskGB || ''} onChange={(e) => setFormData(p => ({ ...p, diskGB: e.target.value ? +e.target.value : null }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Например: 2000" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал *</label><select value={formData.branchId} onChange={(e) => setFormData(p => ({ ...p, branchId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required><option value="">Выберите филиал</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Этаж</label><input type="text" value={formData.floor} onChange={(e) => setFormData(p => ({ ...p, floor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Необязательно" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет/помещение</label><input type="text" value={formData.room} onChange={(e) => setFormData(p => ({ ...p, room: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Серверная" /></div>
          </div>
          {/* Система виртуализации: роль сервера и гипервизор */}
          <div className="border border-purple-100 dark:border-purple-900/50 rounded-xl p-4 bg-purple-50/40 dark:bg-purple-900/10 space-y-3">
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Система виртуализации</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль в инфраструктуре</label>
                <select
                  value={formData.serverRole}
                  onChange={(e) => setFormData(p => ({ ...p, serverRole: e.target.value as ServerRole | '' }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  {serverRoleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {(formData.serverRole === 'hypervisor_host' || formData.serverRole === 'management_console') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Гипервизор / платформа</label>
                  <input list="hypervisor-suggestions" type="text" value={formData.hypervisorName} onChange={(e) => setFormData(p => ({ ...p, hypervisorName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="VMware ESXi, Proxmox VE…" />
                  <datalist id="hypervisor-suggestions">{hypervisorSuggestions.map(h => <option key={h} value={h} />)}</datalist>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Например: два сервера — хосты гипервизора, один — СХД, а консоль управления (vCenter, Proxmox VE) — физический сервер или ВМ.
              После указания роли в сайдбаре появится раздел «Платформа виртуализации».
            </p>
          </div>
          <EmployeeSearch
            value={formData.assignedToEmployeeId}
            onChange={(id) => setFormData(p => ({ ...p, assignedToEmployeeId: id }))}
            label="Ответственный"
            placeholder="Поиск сотрудника..."
          />
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{server ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
