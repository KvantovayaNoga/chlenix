import { useState, useMemo, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from '../router';
import {
  Cpu, Network, Globe, Plus, Edit, Trash2, X, Server, Activity, Search, Filter, Save,
} from 'lucide-react';
import type { VirtualMachine, NetworkInterface, Service, ServerRole } from '../types';
import { serverRoleLabels, serverRoleOptions } from '../utils/virtualization';
import { parsePortList } from '../types';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { FilterManager, SavedFilter } from '../components/FilterManager';

const vmStatusLabels = {
  running: { label: 'Запущена', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  stopped: { label: 'Остановлена', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  maintenance: { label: 'Обслуживание', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  decommissioned: { label: 'Выведена', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const serviceStatusLabels = {
  active: { label: 'Активен', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  inactive: { label: 'Неактивен', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  maintenance: { label: 'Обслуживание', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
};

export function ServersPage() {
  const { virtualMachines, equipment, employees, services, addVM, updateVM, deleteVM, addNetworkInterface, removeNetworkInterface, addService, updateService, deleteService, getVMsByHost, reloadVMs: refreshVMs } = useDataStore();
  const { canEdit, users } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterHost, setFilterHost] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterHasPublicIP, setFilterHasPublicIP] = useState<'all' | 'yes' | 'no'>('all');
  const [filterOS, setFilterOS] = useState('');
  // ВАЖНО: selectedVMSnapshot — снимок на момент открытия. После add/update/delete
  // интерфейсов и сервисов store перезагружает virtualMachines, а старый снимок
  // не обновлялся (баг «изменения видны только после F5»). Теперь актуальная
  // версия резолвится из стора ниже (useMemo selectedVM).
  const [selectedVMSnapshot, setSelectedVM] = useState<VirtualMachine | null>(null);
  const [editingVM, setEditingVM] = useState<VirtualMachine | null>(null);
  const [showAddInterfaceModal, setShowAddInterfaceModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [editingInterface, setEditingInterface] = useState<NetworkInterface | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Актуальная версия выбранной ВМ из стора (обновляется сразу после mutations)
  const selectedVM = useMemo(
    () => (selectedVMSnapshot ? virtualMachines.find((v) => v.id === selectedVMSnapshot.id) ?? selectedVMSnapshot : null),
    [selectedVMSnapshot, virtualMachines],
  );
  const [showFilterManager, setShowFilterManager] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    const saved = localStorage.getItem('servers-filters');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('servers-filters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  const currentFilters = { searchQuery, filterStatus, filterHost, filterResponsible, filterHasPublicIP, filterOS };

  const handleSaveFilter = (name: string, filters: Record<string, any>) => {
    const newFilter: SavedFilter = { id: Date.now().toString(), name, filters };
    setSavedFilters([...savedFilters, newFilter]);
  };

  const handleLoadFilter = (filters: Record<string, any>) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.filterStatus !== undefined) setFilterStatus(filters.filterStatus);
    if (filters.filterHost !== undefined) setFilterHost(filters.filterHost);
    if (filters.filterResponsible !== undefined) setFilterResponsible(filters.filterResponsible);
    if (filters.filterHasPublicIP !== undefined) setFilterHasPublicIP(filters.filterHasPublicIP);
    if (filters.filterOS !== undefined) setFilterOS(filters.filterOS);
  };

  const handleDeleteFilter = (id: string) => {
    setSavedFilters(savedFilters.filter(f => f.id !== id));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('');
    setFilterHost('');
    setFilterResponsible('');
    setFilterHasPublicIP('all');
    setFilterOS('');
  };

  // Обработка query параметра host из URL
  useEffect(() => {
    const hostParam = searchParams.get('host');
    if (hostParam) {
      setFilterHost(hostParam);
    }
  }, [searchParams]);

  const physicalServers = equipment.filter(eq => eq.category === 'server');
  const activeEmployees = employees.filter(e => e.isEmployed);

  const filteredVMs = useMemo(() => {
    return virtualMachines.filter(vm => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        vm.name.toLowerCase().includes(q) ||
        vm.hostname.toLowerCase().includes(q) ||
        vm.os.toLowerCase().includes(q) ||
        vm.networkInterfaces.some(ni => ni.ipAddress.includes(q) || ni.macAddress.toLowerCase().includes(q));
      const matchesStatus = !filterStatus || vm.status === filterStatus;
      const matchesHost = !filterHost || vm.hostServerId === filterHost;
      const matchesResponsible = !filterResponsible || vm.responsibleEmployeeId === filterResponsible || vm.serviceResponsibleEmployeeId === filterResponsible;
      const hasPublicIP = vm.networkInterfaces.some(ni => ni.isPublic);
      const matchesPublicIP = filterHasPublicIP === 'all' || (filterHasPublicIP === 'yes' && hasPublicIP) || (filterHasPublicIP === 'no' && !hasPublicIP);
      const matchesOS = !filterOS || vm.os.toLowerCase().includes(filterOS.toLowerCase());
      return matchesSearch && matchesStatus && matchesHost && matchesResponsible && matchesPublicIP && matchesOS;
    });
  }, [virtualMachines, searchQuery, filterStatus, filterHost, filterResponsible, filterHasPublicIP, filterOS]);

  const getEmployeeName = (id: string | null) => {
    if (!id) return '—';
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.lastName} ${emp.firstName}` : 'Неизвестный';
  };
  const getServerName = (serverId: string | null) => {
    if (!serverId) return '—';
    const server = physicalServers.find(s => s.id === serverId);
    return server?.name || serverId;
  };
  const getUserName = (userId: string | null) => {
    if (!userId) return '—';
    const user = users.find(u => u.id === userId);
    return user?.fullName || 'Система';
  };

  const uniqueOSes = Array.from(new Set(virtualMachines.map(vm => vm.os)));
  const runningCount = virtualMachines.filter(vm => vm.status === 'running').length;
  const publicIPCount = virtualMachines.filter(vm => vm.networkInterfaces.some(ni => ni.isPublic)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Виртуальные машины</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Централизованное управление виртуальной инфраструктурой</p>
        </div>
        {canEdit() && (
          <button onClick={() => setEditingVM({ id: '', name: '', hostname: '', type: 'virtual', hostServerId: null, os: '', cpuCores: 2, ramGB: 4, diskGB: 50, responsibleEmployeeId: null, serviceResponsibleEmployeeId: null, networkInterfaces: [], status: 'running', notes: '', createdAt: '', updatedAt: '', updatedBy: null } as any)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />Создать ВМ
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">Всего ВМ</p>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-200 mt-1">{virtualMachines.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">Запущено</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{runningCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">С белым IP</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{publicIPCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">Физ. хостов</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{physicalServers.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Filter className="w-4 h-4" />Фильтры
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Имя, hostname, IP, MAC, ОС..." className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все статусы</option>
            {Object.entries(vmStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterHost} onChange={(e) => setFilterHost(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все хосты</option>
            {physicalServers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все ответственные</option>
            {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}</option>)}
          </select>
          <select value={filterHasPublicIP} onChange={(e) => setFilterHasPublicIP(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="all">Любые IP</option>
            <option value="yes">С белым IP</option>
            <option value="no">Без белого IP</option>
          </select>
          <select value={filterOS} onChange={(e) => setFilterOS(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
            <option value="">Все ОС</option>
            {uniqueOSes.map(os => <option key={os} value={os}>{os}</option>)}
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

      {/* VM List */}
      <div className="space-y-3">
        {filteredVMs.map(vm => {
          const status = vmStatusLabels[vm.status];
          const vmServices = services.filter(s => s.virtualMachineId === vm.id);
          const publicIPs = vm.networkInterfaces.filter(ni => ni.isPublic);
          return (
            <div key={vm.id} onClick={() => setSelectedVM(vm)} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-gray-700 dark:text-gray-200 text-lg">{vm.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>{status.label}</span>
                    {publicIPs.length > 0 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 flex items-center gap-1"><Globe className="w-3 h-3" />{publicIPs.length} белый IP</span>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {vm.hostname} • {vm.os}
                    {vm.serverRole && vm.serverRole !== 'standalone' && (
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${serverRoleLabels[vm.serverRole].color}`}>{serverRoleLabels[vm.serverRole].label}</span>
                    )}
                  </p>
                </div>
                {canEdit() && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingVM(vm)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm('Удалить ВМ?')) deleteVM(vm.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Хост:</span><p className="font-medium text-gray-700 dark:text-gray-200">{getServerName(vm.hostServerId)}</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ресурсы:</span><p className="font-medium text-gray-700 dark:text-gray-200">{vm.cpuCores} CPU / {vm.ramGB} ГБ / {vm.diskGB} ГБ</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ответ. (инфра):</span><p className="font-medium text-gray-700 dark:text-gray-200">{getEmployeeName(vm.responsibleEmployeeId)}</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ответ. (сервисы):</span><p className="font-medium text-gray-700 dark:text-gray-200">{getEmployeeName(vm.serviceResponsibleEmployeeId)}</p></div>
              </div>
              {/* Network Interfaces */}
              <div className="flex flex-wrap gap-2 mb-2">
                {vm.networkInterfaces.map(ni => (
                  <div key={ni.id} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono ${ni.isPublic ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                    {ni.isPublic ? <Globe className="w-3 h-3" /> : <Network className="w-3 h-3" />}
                    <span>{ni.ipAddress}</span>
                    <span className="text-gray-600 dark:text-gray-400">({ni.name})</span>
                  </div>
                ))}
              </div>
              {/* Services */}
              {vmServices.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  {vmServices.map(svc => {
                    const svcStatus = serviceStatusLabels[svc.status];
                    return (
                      <div key={svc.id} className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-xs">
                        <Activity className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-200">{svc.name}{parsePortList(svc.port).length > 0 && `:${parsePortList(svc.port).join(', ')}`}</span>
                        <span className={`px-1 rounded text-[10px] ${svcStatus.color}`}>{svcStatus.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Обновлено: {new Date(vm.updatedAt).toLocaleString('ru-RU')} • {getUserName(vm.updatedBy)}
              </div>
            </div>
          );
        })}
      </div>

      {filteredVMs.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
          <Cpu className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>Виртуальные машины не найдены</p>
        </div>
      )}

      {/* VM Detail Modal */}
      {selectedVM && (
        <VMDetailModal 
          vm={selectedVM} 
          onClose={() => setSelectedVM(null)} 
          canEdit={canEdit()} 
          employees={employees} 
          services={services.filter(s => s.virtualMachineId === selectedVM.id)} 
          onAddInterface={() => setShowAddInterfaceModal(true)} 
          onEditInterface={(iface) => setEditingInterface(iface)}
          onRemoveInterface={(ifaceId) => { void removeNetworkInterface(selectedVM.id, ifaceId); }} 
          onAddService={() => setShowAddServiceModal(true)} 
          onEditService={(svc) => setEditingService(svc)}
          onDeleteService={(svcId) => { deleteService(svcId); }} 
          getEmployeeName={getEmployeeName} 
          getServerName={getServerName} 
          getUserName={getUserName} 
        />
      )}

      {/* Add/Edit VM Modal */}
      {editingVM && (
        <VMEditModal
          vm={editingVM.id ? editingVM : null}
          onClose={() => setEditingVM(null)}
          onSave={(data) => {
            if (editingVM.id) {
              updateVM(editingVM.id, data);
            } else {
              addVM(data as any);
            }
            setEditingVM(null);
          }}
          servers={physicalServers}
          employees={activeEmployees}
        />
      )}

      {/* Add Interface Modal */}
      {showAddInterfaceModal && selectedVM && (
        <AddInterfaceModal onClose={() => setShowAddInterfaceModal(false)} onSave={async (data) => { await addNetworkInterface(selectedVM.id, data as any); setShowAddInterfaceModal(false); }} />
      )}

      {/* Add Service Modal */}
      {showAddServiceModal && selectedVM && (
        <AddServiceModal onClose={() => setShowAddServiceModal(false)} onSave={(data) => { addService({ ...data, virtualMachineId: selectedVM.id } as any); setShowAddServiceModal(false); }} />
      )}

      {/* Edit Interface Modal */}
      {editingInterface && selectedVM && (
        <EditInterfaceModal 
          interface={editingInterface}
          onClose={() => setEditingInterface(null)} 
          onSave={async (data) => {
            try {
              await api.put(`/network-interfaces/${editingInterface.id}`, data);
              await refreshVMs();
              setEditingInterface(null);
            } catch {
              alert('Не удалось сохранить интерфейс');
            }
          }} 
        />
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <EditServiceModal 
          service={editingService}
          onClose={() => setEditingService(null)} 
          onSave={(data) => { 
            updateService(editingService.id, data);
            setEditingService(null);
          }} 
        />
      )}
    </div>
  );
}

function VMDetailModal({ vm, onClose, canEdit, employees, services, onAddInterface, onEditInterface, onRemoveInterface, onAddService, onEditService, onDeleteService, getEmployeeName, getServerName, getUserName }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2"><Cpu className="w-6 h-6 text-purple-400" />{vm.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-400">Hostname:</span> <span className="font-mono text-gray-200">{vm.hostname}</span></div>
            <div><span className="text-gray-400">ОС:</span> <span className="text-gray-200">{vm.os}</span></div>
            <div><span className="text-gray-400">CPU:</span> <span className="text-gray-200">{vm.cpuCores} ядер</span></div>
            <div><span className="text-gray-400">RAM:</span> <span className="text-gray-200">{vm.ramGB} ГБ</span></div>
            <div><span className="text-gray-400">Диск:</span> <span className="text-gray-200">{vm.diskGB} ГБ</span></div>
            <div><span className="text-gray-400">Хост:</span> <span className="text-gray-200">{getServerName(vm.hostServerId)}</span></div>
            <div><span className="text-gray-400">Статус:</span> <span className={`px-2 py-0.5 rounded text-xs ${vmStatusLabels[vm.status as keyof typeof vmStatusLabels].color}`}>{vmStatusLabels[vm.status as keyof typeof vmStatusLabels].label}</span></div>
            <div><span className="text-gray-400">Тип:</span> <span className="text-gray-200">{vm.type}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div><p className="text-xs text-gray-400 mb-1">Ответственный (инфраструктура)</p><p className="font-medium text-gray-200">{getEmployeeName(vm.responsibleEmployeeId)}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Ответственный (сервисы/middleware)</p><p className="font-medium text-gray-200">{getEmployeeName(vm.serviceResponsibleEmployeeId)}</p></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2"><Network className="w-5 h-5" />Сетевые интерфейсы ({vm.networkInterfaces.length})</h3>
              {canEdit && <button onClick={onAddInterface} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-4 h-4" />Добавить</button>}
            </div>
            <div className="space-y-2">
              {vm.networkInterfaces.map((ni: NetworkInterface) => (
                <div key={ni.id} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    {ni.isPublic ? <Globe className="w-5 h-5 text-orange-400" /> : <Network className="w-5 h-5 text-blue-400" />}
                    <div>
                      <p className="font-medium text-gray-200">{ni.name} <span className="font-mono text-sm">{ni.ipAddress}</span> {ni.isPublic && <span className="text-orange-400 text-xs font-medium ml-2">белый IP</span>}</p>
                      <p className="text-xs text-gray-400">MAC: {ni.macAddress}</p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => onEditInterface(ni)} className="text-indigo-400 hover:text-indigo-300"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => onRemoveInterface(ni.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2"><Activity className="w-5 h-5" />Сервисы и middleware ({services.length})</h3>
              {canEdit && <button onClick={onAddService} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-4 h-4" />Добавить</button>}
            </div>
            <div className="space-y-2">
              {services.map((svc: Service) => (
                <div key={svc.id} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-200">{svc.name} <span className="text-sm text-gray-400">v{svc.version}</span></p>
                    <p className="text-xs text-gray-400">{svc.description} {parsePortList(svc.port).length > 0 && `• Порты: ${parsePortList(svc.port).join(', ')}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${serviceStatusLabels[svc.status].color}`}>{serviceStatusLabels[svc.status].label}</span>
                    {canEdit && (
                      <>
                        <button onClick={() => onEditService(svc)} className="text-indigo-400 hover:text-indigo-300"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => onDeleteService(svc.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 text-xs text-gray-400">
            <p>Создано: {new Date(vm.createdAt).toLocaleString('ru-RU')}</p>
            <p>Обновлено: {new Date(vm.updatedAt).toLocaleString('ru-RU')} • {getUserName(vm.updatedBy)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VMEditModal({ vm, onClose, onSave, servers, employees }: any) {
  const [formData, setFormData] = useState({
    name: vm?.name || '', hostname: vm?.hostname || '', type: vm?.type || 'virtual', hostServerId: vm?.hostServerId || null,
    os: vm?.os || '', cpuCores: vm?.cpuCores || 2, ramGB: vm?.ramGB || 4, diskGB: vm?.diskGB || 50,
    responsibleEmployeeId: vm?.responsibleEmployeeId || null, serviceResponsibleEmployeeId: vm?.serviceResponsibleEmployeeId || null,
    status: vm?.status || 'running', notes: vm?.notes || '',
    serverRole: (vm?.serverRole || '') as ServerRole | '',
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{vm?.id ? 'Редактировать ВМ' : 'Создать виртуальную машину'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя ВМ *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required placeholder="prod-web-01" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hostname *</label><input type="text" value={formData.hostname} onChange={(e) => setFormData(p => ({ ...p, hostname: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required placeholder="web01.company.local" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ОС *</label><input type="text" value={formData.os} onChange={(e) => setFormData(p => ({ ...p, os: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" required placeholder="Ubuntu 22.04 LTS" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Хост-сервер</label><select value={formData.hostServerId || ''} onChange={(e) => setFormData(p => ({ ...p, hostServerId: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"><option value="">— Не указан —</option>{servers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPU (ядер)</label><input type="number" value={formData.cpuCores} onChange={(e) => setFormData(p => ({ ...p, cpuCores: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" min="1" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RAM (ГБ)</label><input type="number" value={formData.ramGB} onChange={(e) => setFormData(p => ({ ...p, ramGB: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" min="1" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Диск (ГБ)</label><input type="number" value={formData.diskGB} onChange={(e) => setFormData(p => ({ ...p, diskGB: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" min="1" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Статус</label><select value={formData.status} onChange={(e) => setFormData(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">{Object.entries(vmStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль в системе виртуализации</label>
              <select value={formData.serverRole} onChange={(e) => setFormData(p => ({ ...p, serverRole: e.target.value as ServerRole | '' }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {serverRoleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Например: консоль управления гипервизором (vCenter / Proxmox VE), размещённая как ВМ.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EmployeeSearch
              value={formData.responsibleEmployeeId}
              onChange={(id) => setFormData(p => ({ ...p, responsibleEmployeeId: id }))}
              label="Ответственный (инфраструктура)"
            />
            <EmployeeSearch
              value={formData.serviceResponsibleEmployeeId}
              onChange={(id) => setFormData(p => ({ ...p, serviceResponsibleEmployeeId: id }))}
              label="Ответственный (сервисы)"
            />
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{vm?.id ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddInterfaceModal({ onClose, onSave }: any) {
  const [formData, setFormData] = useState({ name: 'eth0', macAddress: '', ipAddress: '', isPublic: false, notes: '' });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-200">Добавить сетевой интерфейс</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Имя интерфейса *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="eth0" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">MAC-адрес *</label><input type="text" value={formData.macAddress} onChange={(e) => setFormData(p => ({ ...p, macAddress: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="00:50:56:A1:01:01" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">IP-адрес *</label><input type="text" value={formData.ipAddress} onChange={(e) => setFormData(p => ({ ...p, ipAddress: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="10.0.2.10 или 203.0.113.10" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="isPublic" checked={formData.isPublic} onChange={(e) => setFormData(p => ({ ...p, isPublic: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="isPublic" className="text-sm text-gray-300">Белый (публичный) IP-адрес</label></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Добавить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditInterfaceModal({ interface: iface, onClose, onSave }: any) {
  const [formData, setFormData] = useState({ 
    name: iface?.name || '', 
    macAddress: iface?.macAddress || '', 
    ipAddress: iface?.ipAddress || '', 
    isPublic: iface?.isPublic || false, 
    notes: iface?.notes || '' 
  });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-200">Редактировать сетевой интерфейс</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Имя интерфейса *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="eth0" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">MAC-адрес *</label><input type="text" value={formData.macAddress} onChange={(e) => setFormData(p => ({ ...p, macAddress: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="00:50:56:A1:01:01" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">IP-адрес *</label><input type="text" value={formData.ipAddress} onChange={(e) => setFormData(p => ({ ...p, ipAddress: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="10.0.2.10 или 203.0.113.10" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="isPublicEdit" checked={formData.isPublic} onChange={(e) => setFormData(p => ({ ...p, isPublic: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><label htmlFor="isPublicEdit" className="text-sm text-gray-300">Белый (публичный) IP-адрес</label></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditServiceModal({ service: svc, onClose, onSave }: any) {
  const [formData, setFormData] = useState({ 
    name: svc?.name || '', 
    version: svc?.version || '', 
    port: svc?.port != null ? String(svc.port) : null as string | null, 
    description: svc?.description || '', 
    status: svc?.status || 'active' as const 
  });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-200">Редактировать сервис</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Название *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="Nginx" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Версия</label><input type="text" value={formData.version} onChange={(e) => setFormData(p => ({ ...p, version: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" placeholder="1.24.0" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Порт(ы)</label><input type="text" inputMode="numeric" title="Номера портов через запятую, например: 80, 443" value={formData.port ?? ''} onChange={(e) => setFormData(p => ({ ...p, port: e.target.value.trim() === '' ? null : e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" placeholder="80, 443" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Статус</label>
            <select value={formData.status} onChange={(e) => setFormData(p => ({ ...p, status: e.target.value as any }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="maintenance">Обслуживание</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Описание</label><textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddServiceModal({ onClose, onSave }: any) {
  const [formData, setFormData] = useState({ name: '', version: '', port: null as string | null, description: '', status: 'active' as const });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-200">Добавить сервис</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Название *</label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" required placeholder="Nginx" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Версия</label><input type="text" value={formData.version} onChange={(e) => setFormData(p => ({ ...p, version: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" placeholder="1.24.0" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Порт(ы)</label><input type="text" inputMode="numeric" title="Номера портов через запятую, например: 80, 443" value={formData.port ?? ''} onChange={(e) => setFormData(p => ({ ...p, port: e.target.value.trim() === '' ? null : e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" placeholder="80, 443" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">Описание</label><textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500" rows={2} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Добавить</button>
          </div>
        </form>
      </div>
    </div>
  );
}
