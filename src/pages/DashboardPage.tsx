import { useMemo, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { VMDetailModal } from './ServersPage';
import { Users, Monitor, AlertTriangle, CheckCircle, XCircle, Server, TrendingUp, Cpu, Activity, Building2 } from 'lucide-react';

export function DashboardPage() {
  const {
    getDashboardStats, virtualMachines, equipment, employees, departments, services,
  } = useDataStore();
  const { canManageServers, isAdmin, currentUser, users } = useAuthStore();
  // Клик по ВМ в блоке «Последние виртуальные машины» открывает ту же модалку,
  // что и в категории «Виртуальные машины». Снимок на момент открытия, актуальная
  // версия резолвится из стора (см. ServersPage).
  const [selectedVMSnapshot, setSelectedVM] = useState<any | null>(null);
  const selectedVM = useMemo(
    () => (selectedVMSnapshot ? virtualMachines.find((v) => v.id === selectedVMSnapshot.id) ?? selectedVMSnapshot : null),
    [selectedVMSnapshot, virtualMachines],
  );
  const stats = getDashboardStats();

  // Иерархия видимости (зеркало бэкенда): обычный сотрудник видит только свои ВМ,
  // начальник отдела — ВМ подчинённых, «Руководство» — все ВМ организации.
  const vis = currentUser?.equipmentVisibility;
  const visibleVMs = useMemo(() => (vis && !vis.all
    ? virtualMachines.filter((vm: any) => {
        const ids = new Set<string>(vis.employeeIds ?? []);
        return (vm.responsibleEmployeeId && ids.has(vm.responsibleEmployeeId)) ||
               (vm.serviceResponsibleEmployeeId && ids.has(vm.serviceResponsibleEmployeeId)) ||
               (vm.materiallyResponsibleEmployeeId && ids.has(vm.materiallyResponsibleEmployeeId));
      })
    : virtualMachines), [virtualMachines, vis]);

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

  const runningVMs = virtualMachines.filter(vm => vm.status === 'running');
  const stoppedVMs = virtualMachines.filter(vm => vm.status === 'stopped');
  const maintenanceVMs = virtualMachines.filter(vm => vm.status === 'maintenance');
  const publicIPVMs = virtualMachines.filter(vm => vm.networkInterfaces.some(ni => ni.isPublic));
  const physicalServers = equipment.filter(eq => eq.category === 'server');

  const statCards = [
    { title: 'Организаций', value: stats.totalOrganizations, sub: 'в системе', icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Виртуальных машин', value: stats.totalVMs, sub: `${stats.runningVMs} запущено`, icon: Cpu, color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Физ. серверов', value: physicalServers.length, sub: 'в инфраструктуре', icon: Server, color: 'text-red-600', bg: 'bg-red-50' },
    { title: 'С белым IP', value: publicIPVMs.length, sub: 'публично доступны', icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50' },
    { title: 'Сотрудников', value: stats.totalEmployees, sub: `${stats.activeEmployees} активных`, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Оборудования', value: stats.totalEquipment, sub: `${stats.assignedEquipment} закреплено`, icon: Monitor, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { title: 'Требует ремонта', value: stats.needsRepair, sub: 'единиц', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const maxDepartmentCount = Math.max(...Object.values(stats.byDepartment), 1);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Обзор системы</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Chlenix</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {statCards.map(card => (
          <div key={card.title} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{card.title}</p>
                <p className="text-3xl font-bold text-gray-700 dark:text-gray-200 mt-1">{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{card.sub}</p>
              </div>
              <div className={`${card.bg} dark:bg-gray-700 p-3 rounded-xl`}><card.icon className={`w-6 h-6 ${card.color} dark:opacity-70`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* VM Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 dark:from-purple-900 dark:to-indigo-950 rounded-xl p-6 text-white">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Cpu className="w-5 h-5" />Статус виртуальных машин</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-lg p-4"><p className="text-3xl font-bold">{runningVMs.length}</p><p className="text-sm text-purple-200">Запущено</p></div>
            <div className="bg-white/10 rounded-lg p-4"><p className="text-3xl font-bold">{stoppedVMs.length}</p><p className="text-sm text-purple-200">Остановлено</p></div>
            <div className="bg-white/10 rounded-lg p-4"><p className="text-3xl font-bold">{maintenanceVMs.length}</p><p className="text-sm text-purple-200">Обслуживание</p></div>
            <div className="bg-white/10 rounded-lg p-4"><p className="text-3xl font-bold">{publicIPVMs.length}</p><p className="text-sm text-purple-200">С белым IP</p></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Сотрудники по отделам</h3>
          <div className="space-y-3">
            {Object.entries(stats.byDepartment).map(([dept, count]) => (
              <div key={dept}>
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">{dept}</span><span className="font-medium text-gray-700 dark:text-gray-200">{count}</span></div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5"><div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(count / maxDepartmentCount) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent VMs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Последние виртуальные машины</h3>
        <div className="space-y-2">
          {visibleVMs.slice(0, 5).map(vm => (
            <div
              key={vm.id}
              role="button"
              tabIndex={0}
              title="Открыть карточку виртуальной машины"
              onClick={() => setSelectedVM(vm)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedVM(vm); } }}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-indigo-50 dark:hover:bg-gray-700 hover:ring-1 hover:ring-indigo-200 dark:hover:ring-indigo-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">{vm.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{vm.hostname} • {vm.os}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${vm.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : vm.status === 'stopped' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                  {vm.status === 'running' ? 'Запущена' : vm.status === 'stopped' ? 'Остановлена' : 'Обслуживание'}
                </span>
                {vm.networkInterfaces.some(ni => ni.isPublic) && <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Белый IP</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Карточка ВМ — та же модалка, что при клике в категории «Виртуальные машины».
          Обработчики добавления/редактирования не передаются: VMDetailModal сама
          управляет своими вложенными модалками через стор. */}
      {selectedVM && (
        <VMDetailModal
          vm={selectedVM}
          onClose={() => setSelectedVM(null)}
          canEdit={canManageServers()}
          isAdmin={isAdmin()}
          employees={employees}
          services={services.filter((s: any) => s.virtualMachineId === selectedVM.id)}
          getEmployeeName={getEmployeeName}
          getServerName={getServerName}
          getClusterName={getClusterName}
          getVmClusterName={getVmClusterName}
          getUserName={getUserName}
        />
      )}
    </div>
  );
}
