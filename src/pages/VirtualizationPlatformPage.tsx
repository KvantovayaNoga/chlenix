import { useMemo, useState } from 'react';
import { useNavigate } from '../router';
import { useDataStore } from '../store/dataStore';
import { Layers, Server, HardDrive, TerminalSquare, Cpu, ChevronDown } from 'lucide-react';
import {
  buildVirtualizationPlatforms,
  serverRoleLabels,
  storageTypeLabels,
  storageProtocolLabels,
  formatGB,
  usagePercent,
} from '../utils/virtualization';
import type { Equipment } from '../types';

type PlatformCluster = ReturnType<typeof buildVirtualizationPlatforms>[number]['clusters'][number];

/** Полоса загрузки (использование/ёмкость); переподписка >100% подсвечется красным. */
function UsageBar({ label, used, total, unit, fmt }: { label: string; used: number; total: number; unit?: string; fmt?: (gb: number) => string }) {
  const { pct, over } = usagePercent(used, total);
  const f = fmt ?? ((v: number) => `${v}${unit ?? ''}`);
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span className={over ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
          {f(used)} / {total ? f(total) : '—'} {total ? `(${pct}%)` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Сворачиваемый раздел платформы: заголовок со стрелкой, содержимое скрыто по умолчанию. */
function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50/70 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 flex items-center gap-2 min-w-0 truncate">
          {icon}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </section>
  );
}

/** Кластер — отдельный блок (по аналогии с хостами): сводные аккумулированные
 *  характеристики + вложенные хосты и СХД. Наполнение скрыто до раскрытия. */
function ClusterBlock({
  cluster,
  branchName,
  onOpenVms,
  onOpenPhysical,
}: {
  cluster: PlatformCluster;
  branchName: string;
  onOpenVms: () => void;
  onOpenPhysical: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasResources = cluster.cpuTotal > 0 || cluster.ramTotal > 0 || cluster.diskTotalGB > 0;
  return (
    <div className="rounded-xl border border-purple-100 dark:border-purple-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors"
      >
        <div className="bg-purple-100 dark:bg-purple-900/40 p-2 rounded-lg shrink-0">
          <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{cluster.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {cluster.hosts.length} хост(а) • {cluster.storages.length} СХД • {cluster.vms.length} ВМ • {branchName}
          </p>
        </div>
        {hasResources && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
            {cluster.cpuTotal > 0 && `CPU ${cluster.cpuUsed}/${cluster.cpuTotal}`}
            {cluster.cpuTotal > 0 && cluster.ramTotal > 0 && ' • '}
            {cluster.ramTotal > 0 && `RAM ${cluster.ramUsed}/${cluster.ramTotal} ГБ`}
            {cluster.diskTotalGB > 0 && ` • Диски ${formatGB(cluster.diskTotalGB)}`}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-purple-100 dark:border-purple-900/40">
          {/* Аккумулированные характеристики кластера (суммы хостов и СХД) */}
          {hasResources && (
            <div className="flex flex-wrap gap-4 pt-3">
              <UsageBar label="vCPU кластера" used={cluster.cpuUsed} total={cluster.cpuTotal} unit="" />
              <UsageBar label="RAM кластера" used={cluster.ramUsed} total={cluster.ramTotal} unit=" ГБ" />
              <UsageBar label="Ёмкость СХД" used={0} total={cluster.diskTotalGB} fmt={formatGB} />
            </div>
          )}
          {/* Вложенные хосты */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
              Хосты внутри кластера
            </p>
            {cluster.hosts.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">В кластер пока не добавлены хосты</p>
            ) : (
              <div className="space-y-2 pl-3 border-l-2 border-purple-100 dark:border-purple-900/40">
                {cluster.hosts.map((h) => (
                  <HostRow
                    key={h.id}
                    host={h}
                    vmCount={cluster.vms.filter((v) => v.hostServerId === h.id).length}
                    branchName={branchName}
                    onOpen={onOpenVms}
                  />
                ))}
              </div>
            )}
          </div>
          {/* Вложенные СХД */}
          {cluster.storages.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                СХД внутри кластера
              </p>
              <div className="space-y-2 pl-3 border-l-2 border-cyan-100 dark:border-cyan-900/40">
                {cluster.storages.map((st) => (
                  <div key={st.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className="bg-cyan-50 dark:bg-cyan-900/30 p-2 rounded-lg"><HardDrive className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{st.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {st.brand} {st.model}
                        {(st.storageType || st.storageProtocol || st.storageCapacityGB || st.diskGB) && ' • '}
                        {st.storageType && storageTypeLabels[st.storageType]}
                        {st.storageType && st.storageProtocol && ' / '}
                        {st.storageProtocol && storageProtocolLabels[st.storageProtocol]}
                        {(st.storageCapacityGB || st.diskGB) && ` • ${formatGB(st.storageCapacityGB || st.diskGB || 0)}`}
                      </p>
                    </div>
                    <button onClick={onOpenPhysical} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">
                      Открыть
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Платформа виртуализации — агрегированный взгляд на инфраструктуру:
 * гипервизор, кластеры (отдельные блоки со вложенными хостами/СХД), СХД и консоли.
 * Всё наполнение гипервизора спрятано под кат — пользователь раскрывает сам.
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
                  {p.versions.length > 0 && <>Версии: {p.versions.join(', ')} • </>}
                  Хостов: {p.hosts.length} • Кластеров: {p.clusters.filter((c) => c.name).length} • ВМ: {p.vms.length} • СХД: {p.storage.length} • Консолей: {p.physicalConsoles.length + p.managementConsoles.length}
                </p>
              </div>
              {/* Сводные метрики платформы: CPU/RAM хостов против суммы ВМ, диски СХД против дисков ВМ */}
              <div className="flex flex-wrap gap-4 items-start max-w-xl">
                <UsageBar label="vCPU" used={p.cpuUsed} total={p.cpuTotal} unit="" />
                <UsageBar label="RAM" used={p.ramUsed} total={p.ramTotal} unit=" ГБ" />
                <UsageBar label="Диски" used={p.vmDiskTotalGB} total={p.diskTotalGB} fmt={formatGB} />
              </div>
            </div>

            {/* Наполнение гипервизора спрятано под кат: пользователь раскрывает сам */}
            <div className="p-6 space-y-4">
              {/* Кластеры — отдельные блоки (по аналогии с хостами), хосты вложены внутрь */}
              <CollapsibleSection
                title={<>Кластеры ({p.clusters.filter((c) => c.name).length})</>}
                icon={<Layers className="w-4 h-4 text-purple-500" />}
              >
                {p.clusters.filter((c) => c.name).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Кластеры не созданы</p>
                ) : (
                  <div className="space-y-3">
                    {p.clusters
                      .filter((c) => c.name)
                      .map((c) => (
                        <ClusterBlock
                          key={c.clusterId || c.name}
                          cluster={c}
                          branchName={getBranchName(c.hosts[0]?.branchId || p.storage[0]?.branchId || '')}
                          onOpenVms={() => navigate('/servers')}
                          onOpenPhysical={() => navigate('/servers/physical')}
                        />
                      ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Хосты без кластера */}
              <CollapsibleSection
                title={<>Хосты без кластера ({(p.clusters.find((c) => !c.name)?.hosts || []).length})</>}
                icon={<Server className="w-4 h-4 text-red-500" />}
              >
                {(p.clusters.find((c) => !c.name)?.hosts || []).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Хосты вне кластеров не назначены</p>
                ) : (
                  <div className="space-y-2">
                    {(p.clusters.find((c) => !c.name)?.hosts || []).map((h) => (
                      <HostRow
                        key={h.id}
                        host={h}
                        vmCount={(p.clusters.find((c) => !c.name)?.vms || []).filter((v) => v.hostServerId === h.id).length}
                        branchName={getBranchName(h.branchId)}
                        onOpen={() => navigate('/servers')}
                      />
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* СХД вне кластеров */}
              <CollapsibleSection
                title={<>Системы хранения (СХД) ({p.storage.length})</>}
                icon={<HardDrive className="w-4 h-4 text-cyan-600" />}
              >
                {p.storage.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">СХД не назначены</p>
                ) : (
                  <div className="space-y-2">
                    {p.storage.map((st) => (
                      <div key={st.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-cyan-50 dark:bg-cyan-900/30 p-2 rounded-lg"><HardDrive className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{st.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {st.brand} {st.model}
                            {(st.storageType || st.storageProtocol || st.storageCapacityGB || st.diskGB) && ' • '}
                            {st.storageType && storageTypeLabels[st.storageType]}
                            {st.storageType && st.storageProtocol && ' / '}
                            {st.storageProtocol && storageProtocolLabels[st.storageProtocol]}
                            {(st.storageCapacityGB || st.diskGB) && ` • ${formatGB(st.storageCapacityGB || st.diskGB || 0)}`}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.storage.color}`}>СХД</span>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Консоли управления */}
              <CollapsibleSection
                title={<>Консоли управления ({p.physicalConsoles.length + p.managementConsoles.length})</>}
                icon={<TerminalSquare className="w-4 h-4 text-amber-600" />}
              >
                {p.physicalConsoles.length === 0 && p.managementConsoles.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Консоли не назначены (поле необязательное при создании кластера)</p>
                ) : (
                  <div className="space-y-2">
                    {p.physicalConsoles.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><TerminalSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{c.brand} {c.model} • физический сервер</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.management_console.color}`}>Физ.</span>
                      </div>
                    ))}
                    {p.managementConsoles.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg"><TerminalSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{c.os} • виртуальная машина ({c.hostname})</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serverRoleLabels.management_console.color}`}>ВМ</span>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* ВМ платформы */}
              <CollapsibleSection
                title={<>Виртуальные машины ({p.vms.length})</>}
                icon={<Cpu className="w-4 h-4 text-indigo-600" />}
              >
                {p.vms.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">На этих хостах пока нет ВМ</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {p.vms.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => navigate('/servers')}
                        title={`${v.os || ''} • ${v.cpuCores} CPU / ${v.ramGB} ГБ RAM${v.provisionedOn ? ` • thin: ${v.provisionedOn}` : ''}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
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
