import { useMemo } from 'react';
import { useNavigate } from '../router';
import { useDataStore } from '../store/dataStore';
import { Layers, Server, HardDrive, TerminalSquare, Cpu, Monitor } from 'lucide-react';
import { buildVirtualizationPlatforms, serverRoleLabels } from '../utils/virtualization';
import type { Equipment } from '../types';

/**
 * Платформа виртуализации — агрегированный взгляд на инфраструктуру:
 * гипервизор, серверы-хосты, СХД и консоли управления (физические или ВМ).
 * Пункт появляется в сайдбаре только когда хотя бы у одного сервера/ВМ
 * выставлена роль в системе виртуализации (см. hasVirtualizationFeature).
 */
export function VirtualizationPlatformPage() {
  const { equipment, virtualMachines, branches } = useDataStore();
  const navigate = useNavigate();

  const platforms = useMemo(
    () => buildVirtualizationPlatforms(equipment, virtualMachines),
    [equipment, virtualMachines],
  );

  const getBranchName = (id: string) => branches.find((b) => b.id === id)?.name || '—';

  if (platforms.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Платформа виртуализации</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Опишите систему виртуализации: роли серверов выставляются на странице «Физические серверы» и в карточках ВМ.</p>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-10 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Пока нет серверов с ролью в системе виртуализации</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6">
            Например: два сервера — хосты гипервизора, один — СХД, а консоль управления (vCenter / Proxmox VE) — физический сервер или ВМ.
          </p>
          <button
            onClick={() => navigate('/servers/physical')}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all inline-flex items-center gap-2"
          >
            <Server className="w-4 h-4" /> Перейти к серверам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
          <Layers className="w-8 h-8 text-purple-600 dark:text-purple-400" /> Платформа виртуализации
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Гипервизоры, хосты, СХД и консоли управления организации</p>
      </div>

      <div className="space-y-8">
        {platforms.map((p) => (
          <div key={p.hypervisor} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{p.hypervisor}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Хостов: {p.hosts.length} • ВМ: {p.virtualMachines.length} • СХД: {p.storage.length} • Консолей: {p.physicalConsoles.length + p.managementConsoles.length}
                </p>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Хосты */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4 text-red-500" /> Серверы-хосты
                </h3>
                {p.hosts.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Хосты не назначены</p>
                ) : (
                  <div className="space-y-2">
                    {p.hosts.map((h) => (
                      <HostRow key={h.id} host={h} vmCount={p.virtualMachines.filter((v) => v.hostServerId === h.id).length} branchName={getBranchName(h.branchId)} onOpen={() => navigate(`/servers?host=${h.id}`)} />
                    ))}
                  </div>
                )}
              </section>

              {/* СХД */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-600" /> Системы хранения (СХД)
                </h3>
                {p.storage.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">СХД не назначены</p>
                ) : (
                  <div className="space-y-2">
                    {p.storage.map((st) => (
                      <div key={st.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-cyan-50 dark:bg-cyan-900/30 p-2 rounded-lg"><HardDrive className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{st.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{st.brand} {st.model}{st.diskGB ? ` • ${st.diskGB} ГБ` : ''}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.storage.color}`}>СХД</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Консоли управления */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4 text-amber-600" /> Консоли управления
                </h3>
                {p.physicalConsoles.length === 0 && p.managementConsoles.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Консоли не назначены</p>
                ) : (
                  <div className="space-y-2">
                    {p.physicalConsoles.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><Monitor className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{c.brand} {c.model} • физический сервер</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.management_console.color}`}>Физ.</span>
                      </div>
                    ))}
                    {p.managementConsoles.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><Cpu className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{c.os} • виртуальная машина ({c.hostname})</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.management_console.color}`}>ВМ</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ВМ платформы */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-600" /> Виртуальные машины ({p.virtualMachines.length})
                </h3>
                {p.virtualMachines.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">На этих хостах пока нет ВМ</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {p.virtualMachines.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => navigate('/servers')}
                        title={`${v.os || ''} • ${v.cpuCores} CPU / ${v.ramGB} ГБ RAM`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HostRow({ host, vmCount, branchName, onOpen }: { host: Equipment; vmCount: number; branchName: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
      <div className="bg-red-50 dark:bg-red-900/30 p-2 rounded-lg"><Server className="w-5 h-5 text-red-600 dark:text-red-400" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{host.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {host.brand} {host.model} • {host.cpuCores || '?'} CPU / {host.ramGB || '?'} ГБ • {branchName}
        </p>
      </div>
      <button onClick={onOpen} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">
        ВМ: {vmCount}
      </button>
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${serverRoleLabels.hypervisor_host.color}`}>Хост</span>
    </div>
  );
}

export default VirtualizationPlatformPage;
