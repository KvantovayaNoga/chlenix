import { useState, useMemo, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from '../router';
import {
  Cpu, Network, Globe, Plus, Edit, Trash2, X, Server, Activity, Search, Filter, Save, History,
} from 'lucide-react';
import type { VirtualMachine, NetworkInterface, Service, ServerRole, Equipment, HistoryEntry } from '../types';
import { serverRoleLabels, serverRoleOptions, hypervisorSuggestions, storageTypeLabels, storageProtocolLabels, roleHasResourceFields } from '../utils/virtualization';
import { StorageField } from '../components/StorageField';
import { DecimalInput } from '../components/DecimalInput';
import { parsePortList } from '../types';
import { EmployeeSearch } from '../components/EmployeeSearch';
import { FilterManager, SavedFilter } from '../components/FilterManager';
import { HistoryLog } from '../components/HistoryLog';

// История изменений ВМ: подгружается с сервера (GET /virtual-machines/:id/history)
// по клику на «История изменений» в карточке — по аналогии с оборудованием.
export function VMHistorySection({ vmId, vmName }: { vmId: string; vmName: string }) {
  const [historyData, setHistoryData] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setHistoryData(await api.get<HistoryEntry[]>(`/virtual-machines/${vmId}/history`));
    } catch {
      setHistoryData([]);
    } finally {
      setLoading(false);
    }
  }

  if (historyData === null && !loading) {
    return (
      <button onClick={load} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
        <History className="w-4 h-4" />История изменений
      </button>
    );
  }
  return (
    <div className="pt-4 border-t border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-200 flex items-center gap-2"><History className="w-5 h-5" />История изменений: {vmName}</h3>
        {!loading && <button onClick={() => setHistoryData(null)} className="text-xs text-gray-400 hover:text-gray-300">Свернуть</button>}
      </div>
      {loading ? (
        <p className="text-sm text-gray-400">Загрузка истории…</p>
      ) : (
        <HistoryLog history={historyData ?? []} title="История изменений ВМ" />
      )}
    </div>
  );
}

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
  const { virtualMachines, equipment, employees, services, addVM, updateVM, deleteVM, addNetworkInterface, removeNetworkInterface, addService, updateService, deleteService, getVMsByHost, reloadVMs: refreshVMs, error } = useDataStore();
  // Права синхронизированы с бэкендом: все серверные эндпоинты (ВМ, интерфейсы,
  // сервисы) требуют SERVER_ROLES = admin | sysadmin; удаление ВМ — тоже SERVER_ROLES.
  const { canManageServers, isAdmin, users } = useAuthStore();
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

  // Обработка query параметров URL: host — фильтр по хосту, q — текстовый поиск ВМ
  useEffect(() => {
    const hostParam = searchParams.get('host');
    if (hostParam) {
      setFilterHost(hostParam);
    }
    const qParam = searchParams.get('q');
    if (qParam) {
      setSearchQuery(qParam);
    }
  }, [searchParams]);

  const physicalServers = equipment.filter(eq => eq.category === 'server' || eq.category === ('storage' as any) || !!eq.serverRole);
  // Жёсткой привязки ВМ к гипервизору нет: хостом может быть любой физический
  // сервер — и хост кластера, и автономный сервер без роли («поднял пару
  // виртуалок на обычном сервере»). Запрещены только заведомо неподходящие
  // сущности: сам кластер (логическая), СХД, консоль управления и не-серверы.
  // Дополнительно исключаем объекты категории storage без явной роли —
  // раньше они могли «проскакивать» в список хостов из-за приведения категорий.
  const rolelessStorageIds = new Set(equipment.filter(eq => !eq.serverRole && eq.category === ('storage' as any)).map(eq => eq.id));
  const hypervisorHosts = physicalServers.filter(eq =>
    eq.category === 'server'
    && eq.serverRole !== 'cluster' && eq.serverRole !== 'storage' && eq.serverRole !== 'management_console'
    && !rolelessStorageIds.has(eq.id)
  );
  // Отдельные сущности-кластеры (для опционального поля «Кластер» у ВМ)
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
    const server = equipment.find(s => s.id === serverId);
    return server?.name || serverId;
  };
  const getClusterName = (clusterId: string | null | undefined) => {
    if (!clusterId) return '—';
    const cl = equipment.find(s => s.id === clusterId);
    return cl ? (cl.clusterName || cl.name) : clusterId;
  };
  // Кластер ВМ определяется автоматически по хост-серверу: ВМ живёт на хосте,
  // а хост (если входит в кластер) имеет parentClusterId -> кластер.
  const getVmClusterName = (vm: any): string => {
    const host = vm?.hostServerId ? equipment.find(s => s.id === vm.hostServerId) : null;
    if (!host?.parentClusterId) return '—';
    return getClusterName(host.parentClusterId);
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
        {canManageServers() && (
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
                {(canManageServers() || isAdmin()) && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {canManageServers() && (
                      <button onClick={() => setEditingVM(vm)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Edit className="w-4 h-4" /></button>
                    )}
                    {/* История изменений ВМ доступна всем, кто видит карточку (как и просмотр самой ВМ по клику) */}
                    <button onClick={() => setSelectedVM(vm)} className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30" title="История изменений"><History className="w-4 h-4" /></button>
                    {/* Удаление ВМ на бэкенде разрешено admin и sysadmin (SERVER_ROLES) */}
                    {canManageServers() && (
                      <button onClick={() => { if (confirm('Удалить ВМ?')) deleteVM(vm.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Хост:</span><p className="font-medium text-gray-700 dark:text-gray-200">{getServerName(vm.hostServerId)}</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Кластер:</span><p className="font-medium text-gray-700 dark:text-gray-200">{getVmClusterName(vm)}</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ресурсы:</span><p className="font-medium text-gray-700 dark:text-gray-200">{vm.cpuCores} CPU / {vm.ramGB} ГБ / {vm.diskGB} ГБ</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ответ. (инфра):</span><p className="font-medium text-gray-700 dark:text-gray-200">{getEmployeeName(vm.responsibleEmployeeId)}</p></div>
                <div><span className="text-gray-600 dark:text-gray-400 text-xs">Ответ. (сервисы):</span><p className="font-medium text-gray-700 dark:text-gray-200">{getEmployeeName(vm.serviceResponsibleEmployeeId)}</p></div>
                <div title="Материально ответственное лицо — сотрудник, на подотчёте которого числится ВМ"><span className="text-gray-600 dark:text-gray-400 text-xs">МОЛ:</span><p className="font-medium text-gray-700 dark:text-gray-200">{(() => { const m: any = (vm as any).materiallyResponsibleEmployee; if (m) return [m.lastName, m.firstName].filter(Boolean).join(' '); const mid = (vm as any).materiallyResponsibleEmployeeId; return mid ? getEmployeeName(mid) : '—'; })()}</p></div>
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
          canEdit={canManageServers()}
          isAdmin={isAdmin()} 
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
          getClusterName={getClusterName}
          getVmClusterName={getVmClusterName} 
          getUserName={getUserName} 
        />
      )}

      {/* Add/Edit VM Modal */}
      {editingVM && (
        <VMEditModal
          vm={editingVM.id ? editingVM : null}
          onClose={() => setEditingVM(null)}
          onSave={async (data) => {
            // п.5: если сохранение не удалось — модалка остаётся открытой,
            // текст ошибки показывает глобальный баннер dataStore
            const ok = editingVM.id ? await updateVM(editingVM.id, data) : await addVM(data as any);
            if (ok !== false) setEditingVM(null);
          }}
          servers={hypervisorHosts}
          employees={activeEmployees}
          saveError={error}
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

// Примечание: права синхронизированы с бэкендом — интерфейсы/сервисы доступны
// admin и materially_responsible (canEdit), удаление самой ВМ — только admin.
// Экспортируется: модалка переиспользуется на странице «Обзор» (DashboardPage)
// для просмотра ВМ из блока «Последние виртуальные машины».
export function VMDetailModal({ vm, onClose, canEdit, isAdmin, employees, services, onAddInterface: onAddInterfaceProp, onEditInterface: onEditInterfaceProp, onRemoveInterface, onAddService: onAddServiceProp, onEditService: onEditServiceProp, onDeleteService, getEmployeeName, getServerName, getClusterName, getVmClusterName, getUserName }: any) {
  // Собственные вложенные модалки редактирования интерфейса/сервиса и добавления
  // интерфейса/сервиса: позволяют открывать модалку ВМ на любой странице
  // (например, «Обзор») без подключения внешнего состояния вызывающей страницы.
  const store = useDataStore();
  const [localAddInterface, setLocalAddInterface] = useState(false);
  const [localAddService, setLocalAddService] = useState(false);
  const [localEditInterface, setLocalEditInterface] = useState<NetworkInterface | null>(null);
  const [localEditService, setLocalEditService] = useState<Service | null>(null);

  const handleAddInterface = () => (onAddInterfaceProp ? onAddInterfaceProp() : setLocalAddInterface(true));
  const handleAddService = () => (onAddServiceProp ? onAddServiceProp() : setLocalAddService(true));
  const handleEditInterface = (iface: NetworkInterface) => (onEditInterfaceProp ? onEditInterfaceProp(iface) : setLocalEditInterface(iface));
  const handleEditService = (svc: Service) => (onEditServiceProp ? onEditServiceProp(svc) : setLocalEditService(svc));

  // Если вызывающая страница не передала обработчики удаления (например, «Обзор»),
  // удаляем через стор — изменения сразу отражаются в списке.
  const handleRemoveInterface = (ifaceId: string) => {
    if (onRemoveInterface) { onRemoveInterface(ifaceId); return; }
    void store.removeNetworkInterface(vm.id, ifaceId);
  };
  const handleDeleteService = (svcId: string) => {
    if (onDeleteService) { onDeleteService(svcId); return; }
    void store.deleteService(svcId);
  };

  return (
    <>
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
            <div><span className="text-gray-400">Кластер:</span> <span className="text-gray-200">{getVmClusterName(vm)}</span></div>
            <div><span className="text-gray-400">Статус:</span> <span className={`px-2 py-0.5 rounded text-xs ${vmStatusLabels[vm.status as keyof typeof vmStatusLabels].color}`}>{vmStatusLabels[vm.status as keyof typeof vmStatusLabels].label}</span></div>
            <div><span className="text-gray-400">Тип:</span> <span className="text-gray-200">{vm.type}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div><p className="text-xs text-gray-400 mb-1">Ответственный (инфраструктура)</p><p className="font-medium text-gray-200">{getEmployeeName(vm.responsibleEmployeeId)}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Ответственный (сервисы/middleware)</p><p className="font-medium text-gray-200">{getEmployeeName(vm.serviceResponsibleEmployeeId)}</p></div>
            <div title="Материально ответственное лицо — сотрудник, на подотчёте которого числится ВМ"><p className="text-xs text-gray-400 mb-1">МОЛ (мат. ответственное лицо)</p><p className="font-medium text-gray-200">{(() => { const m: any = (vm as any).materiallyResponsibleEmployee; if (m) return [m.lastName, m.firstName].filter(Boolean).join(' '); const mid = (vm as any).materiallyResponsibleEmployeeId; return mid ? getEmployeeName(mid) : '—'; })()}</p></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2"><Network className="w-5 h-5" />Сетевые интерфейсы ({vm.networkInterfaces.length})</h3>
              {canEdit && <button onClick={handleAddInterface} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-4 h-4" />Добавить</button>}
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
                      <button onClick={() => handleEditInterface(ni)} className="text-indigo-400 hover:text-indigo-300"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleRemoveInterface(ni.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2"><Activity className="w-5 h-5" />Сервисы и middleware ({services.length})</h3>
              {canEdit && <button onClick={handleAddService} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus className="w-4 h-4" />Добавить</button>}
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
                        <button onClick={() => handleEditService(svc)} className="text-indigo-400 hover:text-indigo-300"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteService(svc.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
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

          {/* История изменений ВМ (GET /virtual-machines/:id/history) — по аналогии
              с категорией «Оборудование»: группировка по сохранениям, детали по клику. */}
          <VMHistorySection vmId={vm.id} vmName={vm.name} />
        </div>
      </div>
    </div>

      {/* Вложенные модалки (используются, когда вызывающая страница не передала
          собственные обработчики — например, блок «Последние ВМ» на странице «Обзор») */}
      {localAddInterface && (
        <AddInterfaceModal onClose={() => setLocalAddInterface(false)} onSave={async (data: any) => { await store.addNetworkInterface(vm.id, data); setLocalAddInterface(false); }} />
      )}
      {localAddService && (
        <AddServiceModal onClose={() => setLocalAddService(false)} onSave={(data: any) => { void store.addService({ ...data, virtualMachineId: vm.id }); setLocalAddService(false); }} />
      )}
      {localEditInterface && (
        <EditInterfaceModal
          interface={localEditInterface}
          onClose={() => setLocalEditInterface(null)}
          onSave={async (data: any) => {
            try {
              await api.put(`/network-interfaces/${localEditInterface.id}`, data);
              await store.reloadVMs();
              setLocalEditInterface(null);
            } catch {
              alert('Не удалось сохранить интерфейс');
            }
          }}
        />
      )}
      {localEditService && (
        <EditServiceModal
          service={localEditService}
          onClose={() => setLocalEditService(null)}
          onSave={(data: any) => { void store.updateService(localEditService.id, data); setLocalEditService(null); }}
        />
      )}
    </>
  );
}

function VMEditModal({ vm, onClose, onSave, servers, employees, saveError }: any) {
  // Выбор кластера в форме ВМ убран: принадлежность к кластеру определяется
  // автоматически по хост-серверу (хост входит в кластер => ВМ в этом кластере).
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: vm?.name || '', hostname: vm?.hostname || '', type: vm?.type || 'virtual', hostServerId: vm?.hostServerId || null,
    os: vm?.os || '', cpuCores: vm?.cpuCores || 2, ramGB: vm?.ramGB || 4, diskGB: vm?.diskGB || 50,
    responsibleEmployeeId: vm?.responsibleEmployeeId || null, serviceResponsibleEmployeeId: vm?.serviceResponsibleEmployeeId || null,
    materiallyResponsibleEmployeeId: (vm as any)?.materiallyResponsibleEmployeeId || null,
    status: vm?.status || 'running', notes: vm?.notes || '',
    serverRole: (vm?.serverRole || '') as ServerRole | '',
    provisionedOn: vm?.provisionedOn || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Понятные ошибки: почему нельзя создать/сохранить ВМ
    if (!formData.name.trim()) { setFormError('Укажите имя ВМ — без имени машину не найти в реестре.'); return; }
    if (!formData.hostname.trim()) { setFormError('Укажите hostname ВМ (например, web01.company.local).'); return; }
    if (!formData.hostServerId) {
      setFormError(
        servers.length === 0
          ? 'Нельзя создать ВМ: в реестре нет ни одного физического сервера. Сначала добавьте сервер на странице «Физические серверы» (хостом может быть любой сервер — хост кластера или автономный), затем вернитесь сюда.'
          : 'Не выбран хост-сервер. Укажите физический сервер, на котором размещена ВМ. Кластер определяется автоматически: если хост входит в кластер — ВМ относится к нему.'
      );
      return;
    }
    setFormError(null);
    // ВМ не может быть СХД; «назначенный хост» имеет смысл только для консолей/хостов-ролей
    const payload = { ...formData };
    if (payload.serverRole === '' || payload.serverRole === 'storage') payload.serverRole = '' as any;
    if (payload.serverRole !== 'management_console' && payload.serverRole !== 'hypervisor_host') payload.provisionedOn = '';
    onSave(payload);
  };

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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Хост-сервер *</label>
              <select value={formData.hostServerId || ''} onChange={(e) => { setFormData(p => ({ ...p, hostServerId: e.target.value || null })); setFormError(null); }} className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${formData.hostServerId ? 'border-gray-200 dark:border-gray-600' : 'border-red-300 dark:border-red-600'}`}>
                <option value="">— Выберите хост —</option>
                {servers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Физический сервер, на котором размещена ВМ. Это может быть как хост кластера, так и обычный автономный сервер (без роли гипервизора). Принадлежность к кластеру определяется автоматически: если хост входит в кластер — ВМ относится к тому же кластеру.</p>
              {servers.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Нет доступных хостов: добавьте физический сервер во вкладке «Физические серверы» (гипервизор не обязателен — подойдёт любой сервер).</p>
              )}
            </div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPU (ядер)</label><input type="number" value={formData.cpuCores} onChange={(e) => setFormData(p => ({ ...p, cpuCores: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" min="1" /></div>
            <div><DecimalInput label="RAM (ГБ)" value={formData.ramGB} onChange={(v) => setFormData(p => ({ ...p, ramGB: v ?? 0 }))} placeholder="Например: 8 или 4,5" /></div>
            <div><StorageField label="Диск" valueGB={formData.diskGB} onChange={(gb) => setFormData(p => ({ ...p, diskGB: gb ?? 0 }))} placeholder="Например: 100 или 1,5" hint="Объём хранится в ГБ; единица выбора (КБ…ПБ) — для удобства ввода." /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Статус</label><select value={formData.status} onChange={(e) => setFormData(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">{Object.entries(vmStatusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль в системе виртуализации</label>
              <select value={formData.serverRole} onChange={(e) => setFormData(p => ({ ...p, serverRole: e.target.value as ServerRole | '' }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {serverRoleOptions.filter(o => o.value !== 'storage' && o.value !== 'cluster').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Например: консоль управления гипервизором (vCenter / Proxmox VE), размещённая как ВМ. Кластеры и СХД — только физические серверы.</p>
            </div>
            {(formData.serverRole === 'management_console' || formData.serverRole === 'hypervisor_host') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Назначенный хост (pre-provisioning)</label>
                <input type="text" value={formData.provisionedOn} onChange={(e) => setFormData(p => ({ ...p, provisionedOn: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" placeholder="Имя сервера-хоста, на котором будет размещена ВМ" />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Если ВМ ещё не создана на хосте — укажите планируемое размещение.</p>
              </div>
            )}
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
            <EmployeeSearch
              value={formData.materiallyResponsibleEmployeeId}
              onChange={(id) => setFormData(p => ({ ...p, materiallyResponsibleEmployeeId: id }))}
              label="МОЛ (материально ответственное лицо)"
              placeholder="Сотрудник, на подотчёте которого числится ВМ..."
            />
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label><textarea value={formData.notes} onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={2} /></div>
          {(formError || saveError) && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 space-y-1">
              {formError && <p>{formError}</p>}
              {saveError && !formError && (
                <p>
                  Не удалось сохранить ВМ: {String(saveError)}
                </p>
              )}
            </div>
          )}
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
