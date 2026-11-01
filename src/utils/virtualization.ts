// ============================================================
// Утилиты системы виртуализации: роли оборудования/ВМ в инфраструктуре
// (гипервизор, хосты, СХД, консоли управления).
// Единый источник правды для лейблов, сайдбара и страницы «Платформа виртуализации».
// ============================================================
import type { Equipment, VirtualMachine, ServerRole } from '../types';

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

/** Агрегированный взгляд на платформу виртуализации по активной организации. */
export function buildVirtualizationPlatforms(
  equipment: Equipment[],
  virtualMachines: VirtualMachine[],
): Array<{
  hypervisor: string;
  hosts: Equipment[];
  storage: Equipment[];
  physicalConsoles: Equipment[];
  managementConsoles: VirtualMachine[];
  virtualMachines: VirtualMachine[];
}> {
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

  const platforms = [];
  for (const [hypervisor, hostList] of groups) {
    const hostIds = new Set(hostList.map((h) => h.id));
    const vms = virtualMachines.filter((v) => v.hostServerId && hostIds.has(v.hostServerId));
    platforms.push({
      hypervisor,
      hosts: hostList,
      storage,
      physicalConsoles,
      managementConsoles,
      virtualMachines: vms,
    });
  }
  return platforms.sort((a, b) => a.hypervisor.localeCompare(b.hypervisor));
}
