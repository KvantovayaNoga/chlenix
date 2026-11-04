import { useDataStore } from '../store/dataStore';
import { Server, Edit, Trash2, Plus, X, History, Layers } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { FullHistoryModal, useEntityHistory } from '../components/HistoryLog';
import { ClusterForm, LocationSelect } from '../components/ClusterForm';
import type { Equipment, ServerRole } from '../types';
import { serverRoleLabels, hypervisorSuggestions, normalizeServerPayload, storageTypeLabels, storageProtocolLabels, roleHasResourceFields, formatGB } from '../utils/virtualization';
import { DEFAULT_EQUIPMENT_STATUS } from '../utils/equipmentStatus';
import { StorageField } from '../components/StorageField';
import { DecimalInput } from '../components/DecimalInput';
import { ServerRoleIcon } from '../components/ServerRoleIcon';
import { VmCountBadge } from '../components/VmCountBadge';
import type { StorageSystemType, StorageProtocol } from '../types';

export function PhysicalServersPage() {
  const { equipment, employees, branches, dataCenters, addEquipment, updateEquipment, deleteEquipment, getVMsByHost } = useDataStore();
  // Права синхронизированы с бэкендом: физический сервер/кластер — это Equipment,
  // создание/редактирование — admin|hr_specialist (любая техника) + sysadmin
  // (только инфраструктурная, см. isInfraEquipment), удаление — SERVER_ROLES (admin|sysadmin).
  const { canManageServerCards, canAddEquipment, canManageServers, users } = useAuthStore();
  const navigate = useNavigate();
  const [editingServer, setEditingServer] = useState<Equipment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Кластер — логическая сущность, поэтому создаётся/редактируется отдельной формой
  const [showClusterForm, setShowClusterForm] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Equipment | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Equipment | null>(null);
  // История изменений сервера/кластера подгружается с сервера при открытии
  // (GET /equipment/:id/history) и мгновенно обновляется после любого
  // сохранения (useEntityHistory) — по аналогии с категорией «Оборудование».
  const { history: fullHistory } = useEntityHistory(viewingHistory ? `/equipment/${viewingHistory.id}/history` : null);
  function openHistory(eq: Equipment) {
    setViewingHistory(eq);
  }

  // Серверы организации: категория «Сервер» или «СХД», либо любой единице
  // выставлена роль в системе виртуализации (хост/кластер/СХД/консоль управления).
  const servers = equipment.filter(eq => eq.category === 'server' || eq.category === ('storage' as any) || !!eq.serverRole);
  // Косяк 6/11: кластер-серверы аккумулируют внутри себя хосты и СХД (children по parentClusterId)
  const clusterChildren = (clusterId: string) =>
    equipment.filter(eq => eq.parentClusterId === clusterId);
  const getBranchName = (id: string | null) => {
    const branch = branches.find(b => b.id === id);
    return branch?.name || '—';
  };
  // Место размещения: филиал или ЦОД (кластеры могут жить на арендованных/облачных мощностях)
  const getLocationName = (eq: Equipment) => {
    if (eq.dataCenterId) {
      const dc = dataCenters.find(d => d.id === eq.dataCenterId);
      return dc ? `ЦОД: ${dc.name}` : 'ЦОД: —';
    }
    return getBranchName(eq.branchId);
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
        {canAddEquipment() && (
          <div className="flex items-center gap-3">
            {/* Кластер — отдельная форма (логическая сущность без инвентарной карточки) */}
            <button onClick={() => setShowClusterForm(true)} className="bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-5 py-2.5 rounded-xl font-medium hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all flex items-center gap-2">
              <Layers className="w-5 h-5" />Добавить кластер
            </button>
            <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
              <Plus className="w-5 h-5" />Добавить сервер
            </button>
          </div>
        )}
        {!canAddEquipment() && canManageServerCards() && (
          <span className="text-xs text-gray-400 dark:text-gray-500 self-center">Добавление серверов недоступно для вашей роли</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {servers.map(server => {
          const vms = getVMsByHost(server.id);
          const isCluster = server.serverRole === 'cluster';
          // Кластер — логическая сущность: открывается отдельной формой ClusterForm,
          // у обычного сервера — общий модал ServerModal.
          const openEdit = () => { if (canManageServerCards()) { isCluster ? setEditingCluster(server) : setEditingServer(server); } };
          return (
            <div key={server.id} onClick={openEdit} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ServerRoleIcon role={server.serverRole} />
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      {server.name}
                      {server.serverRole && server.serverRole !== 'standalone' && (
                        <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${serverRoleLabels[server.serverRole].color}`}>
                          {serverRoleLabels[server.serverRole].label}
                        </span>
                      )}
                    </h3>
                    {/* Бренд/модель — только для физических сущностей (кластер их не имеет) */}
                    {!isCluster && (server.brand || server.model) && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{server.brand} {server.model}</p>
                    )}
                    {server.hypervisorName && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Гипервизор: {server.hypervisorName}</p>
                    )}
                  </div>
                </div>
                {/* Удаление оборудования на бэкенде: SERVER_ROLES (admin|sysadmin) */}
                {canManageServers() && (
                  <button onClick={(e) => { e.stopPropagation(); if (confirm('Удалить?')) deleteEquipment(server.id); }} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {/* Серийный/инвентарный номера — атрибуты физической техники; у кластера их нет */}
                {!isCluster && (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Серийный №:</span><span className="font-mono text-xs text-gray-800 dark:text-gray-200">{server.serialNumber || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Инвентарный №:</span><span className="font-mono text-xs text-gray-800 dark:text-gray-200">{server.inventoryNumber || '—'}</span></div>
                  </>
                )}
                {roleHasResourceFields(server.serverRole) && !isCluster && server.cpuCores != null && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU:</span><span className="text-gray-800 dark:text-gray-200">{server.cpuCores} ядер</span></div>
                )}
                {roleHasResourceFields(server.serverRole) && !isCluster && server.ramGB != null && (
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">RAM:</span><span className="text-gray-800 dark:text-gray-200">{server.ramGB} ГБ</span></div>
                )}
                {roleHasResourceFields(server.serverRole) && !isCluster && server.diskGB != null && (
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
                {/* Кластер аккумулирует характеристики хостов и СХД внутри себя;
                    если состав не выбран («Нет хостов» / «Нет СХД») — показываем ручные значения */}
                {isCluster && (() => {
                  const children = clusterChildren(server.id);
                  const hosts = children.filter((c) => c.serverRole === 'hypervisor_host');
                  const stors = children.filter((c) => c.serverRole === 'storage');
                  const consoles = children.filter((c) => c.serverRole === 'management_console');
                  const cpuSum = hosts.reduce((s, h) => s + (h.cpuCores || 0), 0) + (server.cpuCores || 0);
                  const ramSum = hosts.reduce((s, h) => s + (h.ramGB || 0), 0) + (server.ramGB || 0);
                  const diskSum = stors.reduce((s, st) => s + (st.storageCapacityGB || st.diskGB || 0), 0) + (server.storageCapacityGB || 0);
                  return (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Хостов в кластере:</span><span className="text-gray-800 dark:text-gray-200">{hosts.length}{server.cpuCores != null ? ' (указаны вручную)' : ''}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">СХД в кластере:</span><span className="text-gray-800 dark:text-gray-200">{stors.length}{server.storageCapacityGB != null ? ' (объём указан вручную)' : ''}</span></div>
                      {consoles.length > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Консолей управления:</span><span className="text-gray-800 dark:text-gray-200">{consoles.length}</span></div>
                      )}
                      {cpuSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU (суммарно):</span><span className="text-gray-800 dark:text-gray-200">{cpuSum} ядер</span></div>}
                      {ramSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">RAM (суммарно):</span><span className="text-gray-800 dark:text-gray-200">{ramSum} ГБ</span></div>}
                      {diskSum > 0 && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Ёмкость хранилища:</span><span className="text-gray-800 dark:text-gray-200">{formatGB(diskSum)}</span></div>}
                    </>
                  );
                })()}
                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Расположение:</span><span className="text-gray-800 dark:text-gray-200">{getLocationName(server)} {server.room && `, ${server.room}`}</span></div>
                {/* История изменений сервера/кластера — по аналогии с «Оборудованием»:
                    одна запись на сохранение + детализация по полям в модальном окне. */}
                <button
                  onClick={(e) => { e.stopPropagation(); openHistory(server); }}
                  className="mt-1 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  title={`История изменений: ${server.name}`}
                >
                  <History className="w-3.5 h-3.5" />История изменений
                </button>
                {!isCluster && (
                  <div className="flex justify-between" title="Материально ответственное лицо — сотрудник, на подотчёте которого числится сервер"><span className="text-gray-500 dark:text-gray-400">МОЛ:</span><span className="text-gray-800 dark:text-gray-200">{(() => { const m: any = (server as any).materiallyResponsibleEmployee; if (m) return [m.lastName, m.firstName].filter(Boolean).join(' '); const e = employees.find(e => e.id === (server as any).materiallyResponsibleEmployeeId); return e ? `${e.lastName} ${e.firstName}` : '—'; })()}</span></div>
                )}
                {!isCluster && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">ВМ на сервере:</span>
                    <VmCountBadge
                      count={vms.length}
                      onClick={() => navigate(`/servers?host=${server.id}`)}
                      title={`Показать ВМ сервера ${server.name || ''} (${vms.length})`}
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                Обновлено: {new Date(server.updatedAt).toLocaleString('ru-RU')} • {getUserName(server.updatedBy)}
              </div>
            </div>
          );
        })}
      </div>

      {(showAddModal || editingServer) && (
        <ServerEditModal
          server={editingServer}
          onClose={() => { setShowAddModal(false); setEditingServer(null); }}
        />
      )}

      {/* Кластер — отдельная форма создания/редактирования.
          При редактировании в ней можно менять состав: добавлять новое железо
          (галочка) и убирать старое (снять галочку) — сервер применяет это атомарно. */}
      {(showClusterForm || editingCluster) && (
        <ClusterEditModal
          cluster={editingCluster}
          onClose={() => { setShowClusterForm(false); setEditingCluster(null); }}
        />
      )}

      {/* Модалка ПОЛНОЙ истории изменений сервера/кластера: сверху вниз,
          самые свежие записи вверху. Открывается кликом по строке «История
          изменений» в карточке сервера. */}
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

// Публичная форма кластера (используется и на странице, и из модалки карточки
// оборудования). Данные берёт из store, сохранение — через add/updateEquipment.
export function ClusterEditModal({ cluster, onClose }: { cluster: Equipment | null; onClose: () => void }) {
  const { branches, dataCenters, equipment, addEquipment, updateEquipment } = useDataStore();
  return (
    <ClusterForm
      cluster={cluster}
      branches={branches}
      dataCenters={dataCenters}
      allEquipment={equipment}
      onClose={onClose}
      onSave={async (payload, members) => {
        // Состав кластера (members) сервер применяет атомарно в том же запросе:
        // выбранные хосты/СХД/консоли получают parentClusterId, снятые — отвязываются.
        // При ошибке сохранения форму не закрываем (п.5).
        const ok = cluster
          ? await updateEquipment(cluster.id, { ...payload, __members: members } as any)
          : await addEquipment({ ...payload, __members: members } as any);
        if (ok === false) return;
        onClose();
      }}
    />
  );
}

// Публичная форма сервера виртуализации (используется и на странице, и из
// модалки карточки оборудования): нормализует payload и сохраняет через store.
export function ServerEditModal({ server, onClose }: { server: Equipment | null; onClose: () => void }) {
  const { branches, dataCenters, equipment, addEquipment, updateEquipment } = useDataStore();
  return (
    <ServerModal
      server={server}
      branches={branches}
      dataCenters={dataCenters}
      allEquipment={equipment}
      onClose={onClose}
      onSave={async (payload: any) => {
        // п.5: не закрываем форму при ошибке сохранения/валидации
        let base: Record<string, any>;
        if (payload.__roleOnly) {
          // Смена роли у существующего сервера — отправляем только роль и связанные поля,
          // чтобы не затирать характеристики, которые форма не показывает (например CPU/RAM автономного сервера).
          const r: Record<string, any> = { ...payload };
          delete r.__roleOnly;
          if (r.serverRole === '') r.serverRole = null;
          if (r.serverRole !== 'hypervisor_host') r.clusterName = null;
          if (r.serverRole !== 'storage') { r.storageType = null; r.storageProtocol = null; r.storageCapacityGB = null; }
          if (r.serverRole === 'storage' || r.serverRole === 'management_console') { r.cpuCores = null; r.ramGB = null; r.diskGB = null; }
          if (r.serverRole === 'cluster') { r.cpuCores = null; r.ramGB = null; r.diskGB = null; r.parentClusterId = null; }
          if (r.serverRole !== 'hypervisor_host' && r.serverRole !== 'storage') r.parentClusterId = null;
          base = r;
        } else {
          base = normalizeServerPayload(payload, !server);
        }
        const ok = server ? await updateEquipment(server.id, base as any) : await addEquipment(base as any);
        if (ok !== false) onClose();
      }}
    />
  );
}

function ServerModal({ server, onClose, onSave, branches, dataCenters, allEquipment }: any) {
  // Косяк 6: чекбокс «Является платформой виртуализации». Если снят — сервер
  // создаётся как обычный физический (роль не задаётся, поля платформы скрыты).
  // Кластеры здесь не создаются и не редактируются — для них есть ClusterForm.
  const [isPlatform, setIsPlatform] = useState<boolean>(() => !!server?.serverRole);
  const [formData, setFormData] = useState({
    name: server?.name || '', serialNumber: server?.serialNumber || '', inventoryNumber: server?.inventoryNumber || '',
    brand: server?.brand || '', model: server?.model || '', purchaseDate: server?.purchaseDate || new Date().toISOString().split('T')[0],
    condition: server?.condition || DEFAULT_EQUIPMENT_STATUS, assignedToEmployeeId: server?.assignedToEmployeeId || null,
    materiallyResponsibleEmployeeId: (server as any)?.materiallyResponsibleEmployeeId || null,
    branchId: server?.branchId || '', dataCenterId: server?.dataCenterId || '', floor: server?.floor || '', room: server?.room || '',
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
  // Косяк 6/11: список кластеров-серверов для помещения хостов/СХД внутрь кластера.
  // Кластеры создаются только отдельной формой ClusterForm — здесь они не предлагаются.
  const clustersList = ((allEquipment || []) as Equipment[]).filter(
    (eq) => eq.serverRole === 'cluster' && eq.id !== server?.id
  );

  const roleOptions: Array<{ value: ServerRole; label: string }> = [
    { value: 'hypervisor_host', label: serverRoleLabels.hypervisor_host.label },
    { value: 'storage', label: serverRoleLabels.storage.label },
    { value: 'management_console', label: serverRoleLabels.management_console.label },
  ];

  // Кластер — логическая сущность, создаётся/редактируется только через ClusterForm.
  // Если у существующего сервера роль «cluster», не даём выбрать её повторно и
  // показываем подсказку вместо селекта ролей.
  const isClusterServer = server?.serverRole === 'cluster';

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
    if (!isPlatform) {
      onSave({ ...formData, serverRole: '', hypervisorName: '', clusterName: '', hypervisorVersion: '', storageType: '', storageProtocol: '', storageCapacityGB: null, parentClusterId: null });
      return;
    }
    // При редактировании существующего сервера меняем только роль и поля платформы:
    // характеристики (CPU/RAM/Диск), которые форма не показывает для выбранной роли,
    // не должны затираться пустыми значениями. Для новых серверов — полный payload.
    if (server) {
      onSave({
        __roleOnly: true,
        name: formData.name,
        serverRole: formData.serverRole || null,
        hypervisorName: formData.hypervisorName || null,
        clusterName: formData.clusterName || null,
        hypervisorVersion: formData.hypervisorVersion || null,
        storageType: formData.storageType || null,
        storageProtocol: formData.storageProtocol || null,
        storageCapacityGB: formData.storageCapacityGB ?? null,
        parentClusterId: formData.parentClusterId || null,
      });
    } else {
      onSave(formData);
    }
  };

  return (
    <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
            {/* Место размещения: выбор одновременно из справочника филиалов И ЦОД
                (виртуализация/серверы могут стоять как на филиале, так и на
                арендованных/облачных мощностях) — единый селект с группировкой. */}
            <LocationSelect
              branches={branches}
              dataCenters={dataCenters ?? []}
              branchId={formData.branchId}
              dataCenterId={formData.dataCenterId}
              onChange={({ branchId, dataCenterId }) => setFormData(p => ({ ...p, branchId, dataCenterId }))}
              label="Филиал / ЦОД *"
            />
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
            {/* Косяк 7: datalist живёт вне условных блоков и создаётся один раз вместе
                с модалкой. В Chrome связка input@list->datalist, где datalist пересоздаётся
                при каждой смене роли, вызывает «мигание» подсказок/списка. */}
            <datalist id="hypervisor-suggestions">
              {hypervisorSuggestions.map(h => <option key={h} value={h} />)}
            </datalist>
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
              {/* Кластер открывается только отдельной формой ClusterForm (карточка на странице) */}
              {isClusterServer && (
                <p className="col-span-2 text-xs text-purple-600 dark:text-purple-400">
                  Это кластер — логическая сущность. Для редактирования закройте окно и нажмите на карточку кластера: откроется форма кластера.
                </p>
              )}
              {(formData.serverRole === 'hypervisor_host' || formData.serverRole === 'management_console' || formData.serverRole === 'cluster') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Гипервизор / платформа</label>
                  <input list="hypervisor-suggestions" type="text" value={formData.hypervisorName} onChange={(e) => setFormData(p => ({ ...p, hypervisorName: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="VMware ESXi, Proxmox VE…" />
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
          {!isClusterServer && (
            <EmployeeSearch
              value={formData.materiallyResponsibleEmployeeId || null}
              onChange={(id) => setFormData(p => ({ ...p, materiallyResponsibleEmployeeId: id }))}
              label="МОЛ (материально ответственное лицо)"
              placeholder="Сотрудник, на подотчёте которого числится сервер..."
            />
          )}
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

