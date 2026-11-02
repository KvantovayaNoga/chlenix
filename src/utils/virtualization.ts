// ============================================================
// Утилиты системы виртуализации: роли оборудования/ВМ в инфраструктуре
// (гипервизор, кластеры, хосты, СХД, консоли управления).
// Единый источник правды для лейблов, сайдбара и страницы «Платформа виртуализации».
// ============================================================
import type { Equipment, VirtualMachine, ServerRole, StorageSystemType, StorageProtocol } from '../types';

export const serverRoleLabels: Record<ServerRole, { label: string; color: string }> = {
  hypervisor_host: {
    label: 'Хост гипервизора',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  storage: {
    label: 'СХД',
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  },
  management_console: {
    label: 'Консоль управления',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  standalone: {
    label: 'Автономный сервер',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
};

// Варианты для селектора роли (пустое значение — «не участвует», сервер автономный)
export const serverRoleOptions: Array<{ value: ServerRole | ''; label: string }> = [
  { value: '', label: '— Не участвует / автономный —' },
  { value: 'hypervisor_host', label: serverRoleLabels.hypervisor_host.label },
  { value: 'storage', label: serverRoleLabels.storage.label },
  { value: 'management_console', label: serverRoleLabels.management_console.label },
];

export const hypervisorSuggestions = [
  'VMware vSphere / ESXi',
  'Proxmox VE',
  'Microsoft Hyper-V',
  'Citrix Hypervisor',
  'XCP-ng',
  'OpenStack',
  'Яндекс Облако / Virtualization',
  'RHV / oVirt',
];

export const storageTypeLabels: Record<StorageSystemType, string> = {
  san: 'SAN (выделенная СХД)',
  nas: 'NAS (сетевое хранилище)',
  hci: 'HCI (сверхконвергентная)',
};

export const storageProtocolLabels: Record<StorageProtocol, string> = {
  iscsi: 'iSCSI',
  fc: 'Fibre Channel',
  fcoe: 'FCoE',
  nfs: 'NFS',
  smb: 'SMB/CIFS',
  sas: 'SAS',
  nvmeof: 'NVMe-oF',
  vsan: 'vSAN',
  ceph: 'Ceph RBD',
};

/** Признак «система виртуализации описана»: у какого-либо сервера, ВМ или единицы
 *  оборудования выставлена роль, отличная от «автономный». По этому условию в
 *  сайдбаре появляется пункт «Платформа виртуализации» (изначально скрыт). */
export function hasVirtualizationFeature(
  equipment: Equipment[],
  virtualMachines: VirtualMachine[],
): boolean {
  return (
    equipment.some((e) => e.serverRole && e.serverRole !== 'standalone') ||
    virtualMachines.some((v) => v.serverRole && v.serverRole !== 'standalone')
  );
}

export interface PlatformCluster {
  name: string; // '' — хосты без кластера
  hosts: Equipment[];
  /** ВМ, размещённые на хостах этого кластера */
  vms: VirtualMachine[];
  cpuTotal: number;
  cpuUsed: number; // суммарные vCPU ВМ (без учёта переподписки — как есть)
  ramTotal: number;
  ramUsed: number;
}

export interface PlatformInfo {
  hypervisor: string;
  /** Версии гипервизора, встречающиеся на хостах (для заголовка платформы) */
  versions: string[];
  clusters: PlatformCluster[];
  hosts: Equipment[];
  storage: Equipment[];
  physicalConsoles: Equipment[];
  managementConsoles: VirtualMachine[];
  vms: VirtualMachine[];
  cpuTotal: number;
  cpuUsed: number;
  ramTotal: number;
  ramUsed: number;
  diskTotalGB: number; // ёмкость СХД (storageCapacityGB, иначе diskGB)
  vmDiskTotalGB: number; // сумма дисков ВМ (тонкие диски — аллоцированный размер)
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Агрегированный взгляд на платформу виртуализации по активной организации.
 *  Иерархия: гипервизор -> кластер -> хосты -> ВМ; отдельно СХД и консоли управления. */
export function buildVirtualizationPlatforms(
  equipment: Equipment[],
  virtualMachines: VirtualMachine[],
): PlatformInfo[] {
  const hosts = equipment.filter((e) => e.serverRole === 'hypervisor_host');
  const storage = equipment.filter(
    (e) => e.serverRole === 'storage' || e.category === ('storage' as any),
  );
  const physicalConsoles = equipment.filter((e) => e.serverRole === 'management_console');
  const managementConsoles = virtualMachines.filter((v) => v.serverRole === 'management_console');

  // Группируем хосты по гипервизору; если имя не указано — «Гипервизор не указан»
  const groups = new Map<string, Equipment[]>();
  for (const h of hosts) {
    const key = (h.hypervisorName || '').trim() || 'Гипервизор не указан';
    groups.set(key, [...(groups.get(key) || []), h]);
  }

  // Если хостов нет, но есть СХД/консоли — показываем одну сводную «платформу»
  if (groups.size === 0 && (storage.length || physicalConsoles.length || managementConsoles.length)) {
    groups.set('Гипервизор не указан', []);
  }

  const platforms: PlatformInfo[] = [];
  for (const [hypervisor, hostList] of groups) {
    const hostIds = new Set(hostList.map((h) => h.id));
    const vms = virtualMachines.filter((v) => v.hostServerId && hostIds.has(v.hostServerId));

    // Кластеры внутри гипервизора (clusterName у хостов)
    const clusterMap = new Map<string, Equipment[]>();
    for (const h of hostList) {
      const cname = (h.clusterName || '').trim();
      clusterMap.set(cname, [...(clusterMap.get(cname) || []), h]);
    }
    const clusters: PlatformCluster[] = [];
    for (const [cname, clusterHosts] of clusterMap) {
      const ids = new Set(clusterHosts.map((h) => h.id));
      const clusterVms = vms.filter((v) => v.hostServerId && ids.has(v.hostServerId));
      clusters.push({
        name: cname,
        hosts: clusterHosts,
        vms: clusterVms,
        cpuTotal: clusterHosts.reduce((s, h) => s + num(h.cpuCores), 0),
        cpuUsed: clusterVms.reduce((s, v) => s + num(v.cpuCores), 0),
        ramTotal: clusterHosts.reduce((s, h) => s + num(h.ramGB), 0),
        ramUsed: clusterVms.reduce((s, v) => s + num(v.ramGB), 0),
      });
    }
    clusters.sort((a, b) => (a.name || '\uffff').localeCompare(b.name || '\uffff'));

    const versions = Array.from(
      new Set(hostList.map((h) => (h.hypervisorVersion || '').trim()).filter(Boolean)),
    );

    platforms.push({
      hypervisor,
      versions,
      clusters,
      hosts: hostList,
      storage,
      physicalConsoles,
      managementConsoles,
      vms,
      cpuTotal: clusters.reduce((s, c) => s + c.cpuTotal, 0),
      cpuUsed: clusters.reduce((s, c) => s + c.cpuUsed, 0),
      ramTotal: clusters.reduce((s, c) => s + c.ramTotal, 0),
      ramUsed: clusters.reduce((s, c) => s + c.ramUsed, 0),
      diskTotalGB: storage.reduce((s, st) => s + (num(st.storageCapacityGB) || num(st.diskGB)), 0),
      vmDiskTotalGB: vms.reduce((s, v) => s + num(v.diskGB), 0),
    });
  }
  return platforms.sort((a, b) => a.hypervisor.localeCompare(b.hypervisor));
}

/** Форматирование объёма: ГБ -> «ТБ» при >= 1024 ГБ. */
export function formatGB(gb: number): string {
  if (!gb) return '—';
  if (gb >= 1024) return `${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)} ТБ`;
  return `${gb} ГБ`;
}

/** Процент использования для бейджа загрузки (переподписка > 100% помечается separately). */
export function usagePercent(used: number, total: number): { pct: number; over: boolean } {
  if (!total) return { pct: 0, over: false };
  const pct = Math.round((used / total) * 100);
  return { pct, over: pct > 100 };
}

/** Нормализация данных сервера для POST/PUT /api/equipment:
 *  роль «storage» синхронизируется с категорией оборудования, пустые строки -> null,
 *  поля несуществующих ролей обнуляются (на хосте не бывает протокола СХД и наоборот). */
export function normalizeServerPayload<T extends Record<string, any>>(data: T, isCreate: boolean): T {
  const out: any = { ...data };
  if (out.serverRole === '') out.serverRole = null;
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  out.hypervisorName = str(out.hypervisorName);
  out.clusterName = str(out.clusterName);
  out.hypervisorVersion = str(out.hypervisorVersion);
  // Санитарная логика по ролям
  if (out.serverRole !== 'hypervisor_host') {
    out.clusterName = null;
    out.hypervisorVersion = null;
    out.hypervisorName = out.serverRole === 'management_console' ? out.hypervisorName : null;
  }
  if (out.serverRole !== 'storage') {
    out.storageType = null;
    out.storageProtocol = null;
    out.storageCapacityGB = null;
  } else {
    out.storageType = out.storageType || null;
    out.storageProtocol = out.storageProtocol || null;
    if (out.storageCapacityGB === '' || out.storageCapacityGB == null) out.storageCapacityGB = null;
    else out.storageCapacityGB = Number(out.storageCapacityGB) || null;
  }
  if (isCreate) out.category = out.serverRole === 'storage' ? 'storage' : 'server';
  return out as T;
}
