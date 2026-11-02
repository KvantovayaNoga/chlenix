import { useDataStore } from '../store/dataStore';
import { Server, Edit, Trash2, Plus, X, History } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { HistoryLog } from '../components/HistoryLog';
import type { Equipment, ServerRole } from '../types';
import { serverRoleLabels, hypervisorSuggestions, normalizeServerPayload, storageTypeLabels, storageProtocolLabels, roleHasResourceFields, formatGB } from '../utils/virtualization';
import { StorageField } from '../components/StorageField';
import { DecimalInput } from '../components/DecimalInput';
import type { StorageSystemType, StorageProtocol } from '../types';

export function PhysicalServersPage() {
  const { equipment, branches, addEquipment, updateEquipment, deleteEquipment, getVMsByHost } = useDataStore();
  const { canEdit, users } = useAuthStore();
  const navigate = useNavigate();
  const [editingServer, setEditingServer] = useState<Equipment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<Equipment | null>(null);

  // Серверы организации: категория «Сервер» или «СХД», либо любой единице
  // выставлена роль в системе виртуализации (хост/кластер/СХД/консоль управления).
  const servers = equipment.filter(eq => eq.category === 'server' || eq.category === ('storage' as any) || !!eq.serverRole);
  // Косяк 6/11: кластер-серверы аккумулируют внутри себя хосты и СХД (children по parentClusterId)
  const clusterChildren = (clusterId: string) =>
    equipment.filter(eq => eq.parentClusterId === clusterId);
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
                {roleHasResourceFields(server.serverRole) && server.cpuCores != null && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU:</span><span className="text-gray-800 dark:text-gray-200">{server.cpuCores} ядер</span></div>
                )}
                {roleHasResourceFields(server.serverRole) && server.ramGB != null && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">RAM:</span><span className="text-gray-800 dark:text-gray-200">{server.ramGB} ГБ</span></div>
                )}
                {roleHasResourceFields(server.serverRole) && server.diskGB != null && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Диск:</span><span className="text-gray-800 dark:text-gray-200">{formatGB(server.diskGB)}</span></div>
                )}
                {/* Косяк 7: у СХД вместо CPU/RAM — тип, протокол и полезный объём */}
                {server.serverRole === 'storage' && (
                  <>
                    {server.storageType && (
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Тип СХД:</span><span className="text-gray-800 dark:text-gray-200">{storageTypeLabels[server.storageType]}</span></div>
                    )}
                    {server.storageProtocol && (
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Протокол:</span><span className="text-gray-800 dark:text-gray-200">{storageProtocolLabels[server.storageProtocol]}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Полезный объём:</span><span className="text-gray-800 dark:text-gray-200">{server.storageCapacityGB ? formatGB(server.storageCapacityGB) : '—'}</span></div>
                  </>
                )}
                {/* Косяк 11: кластер аккумулирует характеристики хостов и СХД внутри себя */}
                {server.serverRole === 'cluster' && (() => {
                  const children = clusterChildren(server.id);
                  const hosts = children.filter((c) => c.serverRole === 'hypervisor_host');
                  const stors = children.filter((c) => c.serverRole === 'storage');
                  const cpuSum = hosts.reduce((s, h) => s + (h.cpuCores || 0), 0);
                  const ramSum = hosts.reduce((s, h) => s + (h.ramGB || 0), 0);
                  const diskSum = stors.reduce((s, st) => s + (st.storageCapacityGB || st.diskGB || 0), 0);
                  return (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Хостов в кластере:</span><span className="text-gray-800 dark:text-gray-200">{hosts.length}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">СХД в кластере:</span><span className="text-gray-800 dark:text-gray-200">{stors.length}</span></div>
                      {cpuSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU (суммарно):</span><span className="text-gray-800 dark:text-gray-200">{cpuSum} ядер</span></div>}
                      {ramSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">RAM (суммарно):</span><span className="text-gray-800 dark:text-gray-200">{ramSum} ГБ</span></div>}
                      {diskSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Ёмкость СХД:</span><span className="text-gray-800 dark:text-gray-200">{formatGB(diskSum)}</span></div>}
                    </>
                  );
                })()}
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
            if (editingServer) { updateEquipment(editingServer.id, normalizeServerPayload(data, false)); }
            else {
              addEquipment(normalizeServerPayload(data, true) as any);
            }
            setShowAddModal(false); setEditingServer(null);
          }}
          branches={branches}
          allEquipment={equipment}
        />
      )}
    </div>
  );
}

function ServerModal({ server, onClose, onSave, branches, allEquipment }: any) {
  // Косяк 6: чекбокс «Является платформой виртуализации». Если снят — сервер
  // создаётся как обычный физический (роль не задаётся, поля платформы скрыты).
  const [isPlatform, setIsPlatform] = useState<boolean>(() => !!server?.serverRole);
  const [formData, setFormData] = useState({
    name: server?.name || '', serialNumber: server?.serialNumber || '', inventoryNumber: server?.inventoryNumber || '',
    brand: server?.brand || '', model: server?.model || '', purchaseDate: server?.purchaseDate || new Date().toISOString().split('T')[0],
    condition: server?.condition || 'good', assignedToEmployeeId: server?.assignedToEmployeeId || null,
    branchId: server?.branchId || '', floor: server?.floor || '', room: server?.room || '',
    cpuCores: server?.cpuCores || null, ramGB: server?.ramGB || null, diskGB: server?.diskGB || null,
    serverRole: (server?.serverRole || '') as ServerRole | '',
    hypervisorName: server?.hypervisorName || '',
    clusterName: server?.clusterName || '',
    hypervisorVersion: server?.hypervisorVersion || '',
    storageType: (server?.storageType || '') as StorageSystemType | '',
    storageProtocol: (server?.storageProtocol || '') as StorageProtocol | '',
    storageCapacityGB: server?.storageCapacityGB || null,
    parentClusterId: server?.parentClusterId || null,
    notes: server?.notes || '',
  });
  // Косяк 6/11: список кластеров-серверов для помещения хостов/СХД внутрь кластера
  const clustersList = ((allEquipment || []) as Equipment[]).filter(
    (eq) => eq.serverRole === 'cluster' && eq.id !== server?.id
  );

  const roleOptions: Array<{ value: ServerRole; label: string }> = [
    { value: 'hypervisor_host', label: serverRoleLabels.hypervisor_host.label },
    { value: 'cluster', label: serverRoleLabels.cluster.label },
    { value: 'storage', label: serverRoleLabels.storage.label },
    { value: 'management_console', label: serverRoleLabels.management_console.label },
  ];

  const handleTogglePlatform = (checked: boolean) => {
    setIsPlatform(checked);
    if (!checked) {
      // Обычный физический сервер: роль и все атрибуты платформы сбрасываются
      setFormData((p) => ({
        ...p,
        serverRole: '', hypervisorName: '', clusterName: '', hypervisorVersion: '',
        storageType: '' as any, storageProtocol: '' as any, storageCapacityGB: null, parentClusterId: null,
      }));
    } else if (!formData.serverRole) {
      setFormData((p) => ({ ...p, serverRole: 'hypervisor_host' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Косяк 6: без чекбокса сервер — обычный физический (role = null)
    onSave(isPlatform ? formData : { ...formData, serverRole: '', hypervisorName: '', clusterName: '', hypervisorVersion: '', storageType: '', storageProtocol: '', storageCapacityGB: null, parentClusterId: null });
  };

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
            {roleHasResourceFields(isPlatform ? formData.serverRole : '') && (
              <>
                <div><DecimalInput label="CPU (ядер)" value={formData.cpuCores} onChange={(v) => setFormData(p => ({ ...p, cpuCores: v }))} placeholder="Например: 32" min={1} /></div>
                <div><DecimalInput label="RAM (ГБ)" value={formData.ramGB} onChange={(v) => setFormData(p => ({ ...p, ramGB: v }))} placeholder="Например: 128 или 64,5" min={0.001} /></div>
                <div><StorageField label="Диск" valueGB={formData.diskGB} onChange={(gb) => setFormData(p => ({ ...p, diskGB: gb }))} placeholder="Например: 2000 или 12,5" hint="Объём хранится в ГБ; единица выбора (КБ…ПБ) — для удобства ввода." /></div>
              </>
            )}
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Филиал *</label><select value={formData.branchId} onChange={(e) => setFormData(p => ({ ...p, branchId: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required><option value="">Выберите филиал</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Этаж</label><input type="text" value={formData.floor} onChange={(e) => setFormData(p => ({ ...p, floor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Необязательно" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет/помещение</label><input type="text" value={formData.room} onChange={(e) => setFormData(p => ({ ...p, room: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Серверная" /></div>
          </div>
          {/* Косяк 6: чекбокс «Является платформой виртуализации» — при включении
              появляются поля роли и параметры платформы; при выключении сервер
              сохраняется как обычный физический сервер. */}
          <div className="border border-purple-100 dark:border-purple-900/50 rounded-xl p-4 bg-purple-50/40 dark:bg-purple-900/10 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPlatform}
                onChange={(e) => handleTogglePlatform(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Является платформой виртуализации</span>
            </label>
            {isPlatform ? (
            <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль в инфраструктуре</label>
                <select
                  value={formData.serverRole}
                  onChange={(e) => setFormData(p => ({ ...p, serverRole: e.target.value as ServerRole }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  {roleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {(formData.serverRole === 'hypervisor_host' || formData.serverRole === 'management_console' || formData.serverRole === 'cluster') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Гипервизор / платформа</label>
                  <input list="hypervisor-suggestions" type="text" value={formData.hypervisorName} onChange={(e) => setFormData(p => ({ ...p, hypervisorName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="VMware ESXi, Proxmox VE…" />
                  <datalist id="hypervisor-suggestions">{hypervisorSuggestions.map(h => <option key={h} value={h} />)}</datalist>
                </div>
              )}
              {formData.serverRole === 'cluster' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя кластера</label>
                    <input type="text" value={formData.clusterName} onChange={(e) => setFormData(p => ({ ...p, clusterName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Например: HA-Cluster-01 (по умолчанию — как наименование)" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Версия гипервизора</label>
                    <input type="text" value={formData.hypervisorVersion} onChange={(e) => setFormData(p => ({ ...p, hypervisorVersion: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="vSphere 8.0 U2, PVE 8.2…" />
                  </div>
                </>
              )}
              {formData.serverRole === 'hypervisor_host' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кластер</label>
                    <select value={formData.parentClusterId || ''} onChange={(e) => setFormData(p => ({ ...p, parentClusterId: e.target.value || null, clusterName: '' }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      <option value="">— Вне кластера —</option>
                      {clustersList.map((cl: Equipment) => <option key={cl.id} value={cl.id}>{cl.clusterName || cl.name}</option>)}
                    </select>
                    {clustersList.length === 0 && (
                      <input type="text" value={formData.clusterName} onChange={(e) => setFormData(p => ({ ...p, clusterName: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Или укажите имя кластера текстом: HA-Cluster-01" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Версия гипервизора</label>
                    <input type="text" value={formData.hypervisorVersion} onChange={(e) => setFormData(p => ({ ...p, hypervisorVersion: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="ESXi 8.0 U2, PVE 8.2…" />
                  </div>
                </>
              )}
              {formData.serverRole === 'storage' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип СХД</label>
                    <select value={formData.storageType} onChange={(e) => setFormData(p => ({ ...p, storageType: e.target.value as StorageSystemType | '' }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      <option value="">— Не указан —</option>
                      {Object.entries(storageTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Протокол доступа</label>
                    <select value={formData.storageProtocol} onChange={(e) => setFormData(p => ({ ...p, storageProtocol: e.target.value as StorageProtocol | '' }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      <option value="">— Не указан —</option>
                      {Object.entries(storageProtocolLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <StorageField
                      label="Полезный объём"
                      valueGB={formData.storageCapacityGB}
                      onChange={(gb) => setFormData(p => ({ ...p, storageCapacityGB: gb }))}
                      placeholder="Например: 48 или 12,5"
                      hint="Объём хранится в системе в ГБ; выбирайте удобную единицу (КБ…ПБ). Дробные значения — только через запятую."
                    />
                  </div>
                  {clustersList.length > 0 && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кластер, которому принадлежит СХД</label>
                      <select value={formData.parentClusterId || ''} onChange={(e) => setFormData(p => ({ ...p, parentClusterId: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        <option value="">— Вне кластера —</option>
                        {clustersList.map((cl: Equipment) => <option key={cl.id} value={cl.id}>{cl.clusterName || cl.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Например: два сервера — хосты гипервизора, один — СХД, а консоль управления (vCenter, Proxmox VE) — физический сервер или ВМ.
              После указания роли в сайдбаре появится раздел «Платформа виртуализации».
            </p>
            </>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Сервер будет сохранён как обычный физический сервер без участия в системе виртуализации.
              </p>
            )}
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
