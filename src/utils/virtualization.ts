// ============================================================
// Утилиты для работы с числами и единицами измерения (косяки 9, 10)
// ============================================================

/** Единицы измерения объёма дисков. В БД всё хранится в ГБ. */
export type StorageUnit = 'KB' | 'MB' | 'GB' | 'TB' | 'PB';

export const storageUnitLabels: Record<StorageUnit, string> = {
  KB: 'КБ',
  MB: 'МБ',
  GB: 'ГБ',
  TB: 'ТБ',
  PB: 'ПБ',
};

const UNIT_TO_GB: Record<StorageUnit, number> = {
  KB: 1 / 1024 ** 3,
  MB: 1 / 1024 ** 2,
  GB: 1,
  TB: 1024,
  PB: 1024 ** 2,
};

/** Перевод значения из выбранной единицы в ГБ (для хранения в БД). */
export function toGB(value: number, unit: StorageUnit): number {
  return value * UNIT_TO_GB[unit];
}

/** Обратный перевод: ГБ -> значение в указанной единице. */
export function fromGB(gb: number, unit: StorageUnit): number {
  return gb / UNIT_TO_GB[unit];
}

/** Подбирает «удобную» единицу для отображения (>=1 и <1024). */
export function autoUnit(gb: number): StorageUnit {
  if (!gb || gb <= 0) return 'GB';
  if (gb >= 1024 ** 2) return 'PB';
  if (gb >= 1024) return 'TB';
  if (gb < 1) return 'MB';
  return 'GB';
}

/** Форматирование дробного числа по-русски: запятая как разделитель. */
export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) return '';
  // убираем «хвосты» от плавающей точки (Float в Postgres)
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded).replace('.', ',');
}

/** Парсит ввод пользователя: только цифры и одна запятая. Точка НЕ допускается. */
export function parseDecimalInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Ищет кластер-сущность (serverRole === 'cluster') без консоли управления.
 *  Консолью считается ВМ с serverRole === 'management_console', хост-сервер
 *  которой входит в этот кластер (hostServer.parentClusterId === cluster.id).
 *  Используется чекбоксом «Консоль управления гипервизором» в форме ВМ:
 *  при выборе такая ВМ автоматически привязывается к найденному кластеру. */
export function findClusterWithoutConsole(
  equipment: any[],
  virtualMachines: any[],
  excludeVmId?: string | null,
): any | null {
  const clusters = equipment.filter((e) => e.serverRole === 'cluster');
  if (clusters.length === 0) return null;
  // id хостов, входящих в каждый кластер
  const hostIdsByCluster = new Map<string, Set<string>>();
  for (const h of equipment) {
    const pc = typeof h.parentClusterId === 'string' ? h.parentClusterId.trim() : '';
    if (!pc) continue;
    if (!hostIdsByCluster.has(pc)) hostIdsByCluster.set(pc, new Set());
    hostIdsByCluster.get(pc)!.add(h.id);
  }
  // id кластеров, у которых уже есть консоль (ВМ-консоль на хосте этого кластера)
  const consoleClusterIds = new Set<string>();
  for (const v of virtualMachines) {
    if (excludeVmId && v.id === excludeVmId) continue;
    if (v.serverRole !== 'management_console' || !v.hostServerId) continue;
    for (const [clusterId, hostIds] of hostIdsByCluster) {
      if (hostIds.has(v.hostServerId)) consoleClusterIds.add(clusterId);
    }
  }
  const withoutConsole = clusters.filter((cl) => !consoleClusterIds.has(cl.id));
  return withoutConsole.length > 0 ? withoutConsole[0] : null;
}

/** Санитизация строки ввода: пропускает только цифры и одну запятую.
 *  Возвращает [чищеннаяСтрока, былОтброшенСимвол]. */
export function sanitizeDecimalText(raw: string): [string, boolean] {
  let dropped = false;
  let result = '';
  let seenComma = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if (ch === ',' && !seenComma) {
      seenComma = true;
      result += ch;
    } else {
      if (ch !== '') dropped = true;
    }
  }
  return [result, dropped];
}
// ============================================================
// Утилиты системы виртуализации: роли оборудования/ВМ в инфраструктуре
// (гипервизор, кластеры, хосты, СХД, консоли управления).
// Единый источник правды для лейблов, сайдбара и страницы «Платформа виртуализации».
// ============================================================
import type { Equipment, VirtualMachine, ServerRole, StorageSystemType, StorageProtocol } from '../types';

// Примечание (2026-11): роль 'cluster' в интерфейсе называется «Хост» — это
// физический сервер платформы виртуализации (хост гипервизора). Кластер
// виртуализации как логическая сущность состоит из «Хост», «Система хранения
// данных», «Консоль управления» и «Виртуальные машины». Внутренний код роли
// ('cluster') сохранён ради совместимости с БД и API.
export const serverRoleLabels: Record<ServerRole, { label: string; color: string }> = {
  hypervisor_host: {
    label: 'Хост гипервизора',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  cluster: {
    label: 'Хост',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
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
  { value: 'cluster', label: serverRoleLabels.cluster.label },
  { value: 'storage', label: serverRoleLabels.storage.label },
  { value: 'management_console', label: serverRoleLabels.management_console.label },
];

/** Косяк 7/8: у СХД и консолей управления не бывает CPU/RAM/Диска — эти поля
 *  скрываются в формах и обнуляются при сохранении. */
export function roleHasResourceFields(role: ServerRole | '' | null | undefined): boolean {
  return role !== 'storage' && role !== 'management_console';
}

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
  /** ID Equipment-кластера (serverRole === 'cluster'), если кластер заведён отдельной сущностью */
  clusterId?: string;
  hosts: Equipment[];
  /** СХД, помещённые внутрь этого кластера (parentClusterId) */
  storages: Equipment[];
  /** ВМ, размещённые на хостах этого кластера */
  vms: VirtualMachine[];
  cpuTotal: number;
  cpuUsed: number; // суммарные vCPU ВМ (без учёта переподписки — как есть)
  ramTotal: number;
  ramUsed: number;
  diskTotalGB: number; // аккумулированная ёмкость СХД кластера
}

export interface PlatformInfo {
  hypervisor: string;
  /** true — безымянная псевдо-платформа «Гипервизор не указан»: её шапка не
   *  создаёт новый гипервизор, а только приют для СХД/консолей без платформы. */
  unnamed?: boolean;
  /** Версии гипервизора, встречающиеся на хостах (для заголовка платформы) */
  versions: string[];
  clusters: PlatformCluster[];
  /** Хосты без кластера — ОБСОБЛЕННАЯ категория верхнего уровня (на одном уровне с
   *  платформами-гипервизорами), а не подраздел гипервизора: они не являются частью
   *  ни одного кластера. Внутри категории нет подкатегорий — только список хостов. */
  hostsWithoutCluster: { hosts: Equipment[]; vms: VirtualMachine[] };
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
  // Отдельные сущности-кластеры (косяк 6/11): аккумулируют хосты и СХД через parentClusterId
  const clusterEntities = equipment.filter((e) => e.serverRole === 'cluster');
  // Полный список СХД организации (для вложенных внутрь кластеров хранилищ)
  const allStorage = equipment.filter(
    (e) => e.serverRole === 'storage' || e.category === ('storage' as any),
  );
  // СХД — физические единицы хранения. Внутренние хранилища кластеров НЕ
  // дублируются отдельной секцией: они показываются только внутри своего
  // кластера/хоста (parentClusterId). Плоская секция «Система хранения данных»
  // содержит только СХД вне кластеров.
  const storage = allStorage.filter((e) => !(e.parentClusterId || '').trim());
  const physicalConsoles = equipment.filter((e) => e.serverRole === 'management_console');
  const managementConsoles = virtualMachines.filter((v) => v.serverRole === 'management_console');

  // Группируем хосты по гипервизору. Если поле «Гипервизор / платформа» пустое —
  // хост НЕ порождает новый гипервизор без имени: он попадает в общую категорию
  // «Хосты без кластера» (standaloneHosts на странице) и не создаёт платформу.
  const groups = new Map<string, Equipment[]>();
  for (const h of hosts) {
    const key = (h.hypervisorName || '').trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), h]);
  }
  // Кластеры тоже привязываются к гипервизору — добавляем их группы,
  // чтобы сущность-кластер была видна на платформе даже без хостов.
  // Кластер без имени гипервизора — тоже отдельного гипервизора не создаёт.
  for (const cl of clusterEntities) {
    const key = (cl.hypervisorName || '').trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
  }

  // Если реальных гипервизоров нет, но есть СХД/консоли — показываем одну сводную
  // безымянную псевдо-платформу (она не является «новым гипервизором», unnamed).
  let pseudoPlatformNeeded = false;
  if (groups.size === 0 && (storage.length || physicalConsoles.length || managementConsoles.length)) {
    groups.set('Гипервизор не указан', []);
    pseudoPlatformNeeded = true;
  }

  const platforms: PlatformInfo[] = [];
  // Хосты без имени гипервизора («Гипервизор не указан» больше не создаётся) —
  // собираются в отдельный плоский список: они попадают в категорию
  // «Хосты без кластера», при этом ВМ на них продолжают учитываться.
  const hostsNoHypervisor = hosts.filter((h) => !(h.hypervisorName || '').trim());
  const vmsOnHostsNoHypervisor = virtualMachines.filter(
    (v) => v.hostServerId && hostsNoHypervisor.some((h) => h.id === v.hostServerId),
  );

  for (const [hypervisor, hostList] of groups) {
    const hostIds = new Set(hostList.map((h) => h.id));
    const vms = virtualMachines.filter((v) => v.hostServerId && hostIds.has(v.hostServerId));

    // Кластеры внутри гипервизора. Источник имени: clusterName у хоста или
    // отдельная сущность-кластер (serverRole === 'cluster'), в которую хост помещён.
    const clusterMap = new Map<string, Equipment[]>();
    const clusterEntityByName = new Map<string, Equipment>();
    for (const cl of clusterEntities) {
      const cname = (cl.clusterName || cl.name || '').trim();
      if (cname) clusterEntityByName.set(cname, cl);
    }
    for (const h of hostList) {
      const pc = h.parentClusterId ? clusterEntities.find((c) => c.id === h.parentClusterId) : null;
      const cname = (pc?.clusterName || pc?.name || h.clusterName || '').trim();
      clusterMap.set(cname, [...(clusterMap.get(cname) || []), h]);
    }
    // Пустые кластеры (сущность без членов-хостов) тоже показываем
    for (const [cname, cl] of clusterEntityByName) {
      if (!clusterMap.has(cname)) clusterMap.set(cname, []);
    }

    const clusters: PlatformCluster[] = [];
    for (const [cname, clusterHosts] of clusterMap) {
      const ids = new Set(clusterHosts.map((h) => h.id));
      const clusterVms = vms.filter((v) => v.hostServerId && ids.has(v.hostServerId));
      const entity = clusterEntityByName.get(cname);
      // СХД, помещённые внутрь кластера: по явной связи parentClusterId или по
      // совпадению имени кластера у СХД (легаси). Берём из полного списка
      // хранилищ allStorage — внутри кластера СХД показываются только здесь,
      // в плоскую секцию «Система хранения данных» они не попадают.
      const clusterStorages = cname
        ? allStorage.filter((st) => (entity && st.parentClusterId === entity.id) || (st.clusterName || '').trim() === cname)
        : [];
      clusters.push({
        name: cname,
        clusterId: entity?.id,
        hosts: clusterHosts,
        storages: clusterStorages,
        vms: clusterVms,
        cpuTotal: clusterHosts.reduce((s, h) => s + num(h.cpuCores), 0),
        cpuUsed: clusterVms.reduce((s, v) => s + num(v.cpuCores), 0),
        ramTotal: clusterHosts.reduce((s, h) => s + num(h.ramGB), 0),
        ramUsed: clusterVms.reduce((s, v) => s + num(v.ramGB), 0),
        diskTotalGB: clusterStorages.reduce((s, st) => s + (num(st.storageCapacityGB) || num(st.diskGB)), 0),
      });
    }
    clusters.sort((a, b) => (a.name || '\uffff').localeCompare(b.name || '\uffff'));

    // Хосты без кластера — на одном уровне вложенности с кластерами: выделяем их
    // из clusters в отдельную группу и исключаем безымянную запись из clusters.
    const noClusterEntry = clusters.find((c) => !c.name);
    const namedClusters = clusters.filter((c) => c.name);
    const hostsWithoutCluster = {
      hosts: noClusterEntry?.hosts ?? [],
      vms: noClusterEntry?.vms ?? [],
    };

    const versions = Array.from(
      new Set(
        [...hostList, ...clusterEntities]
          .map((h) => (h.hypervisorVersion || '').trim())
          .filter(Boolean),
      ),
    );

    platforms.push({
      hypervisor,
      unnamed: pseudoPlatformNeeded,
      versions,
      clusters: namedClusters,
      hostsWithoutCluster,
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

/**
 * Хосты без кластера — ОБСОБЛЕННАЯ категория верхнего уровня страницы
 * «Платформа виртуализации». Сюда попадают ВСЕ хосты гипервизора, которые не
 * входят ни в один кластер: и с заполненным полем «Гипервизор / платформа», и с
 * пустым (пустое поле НЕ создаёт новый гипервизор без имени). ВМ считаются по
 * фактическому hostServerId, независимо от гипервизора хоста.
 */
export function buildHostsWithoutCluster(
  equipment: Equipment[],
  virtualMachines: VirtualMachine[],
): { host: Equipment; vmCount: number }[] {
  const hosts = equipment.filter((e) => e.serverRole === 'hypervisor_host');
  const result: { host: Equipment; vmCount: number }[] = [];
  for (const h of hosts) {
    if ((h.parentClusterId || '').trim()) continue; // входит в кластер-сущность
    if ((h.clusterName || '').trim()) continue;      // входит в именованный кластер (легаси)
    const vmCount = virtualMachines.filter((v) => v.hostServerId === h.id).length;
    result.push({ host: h, vmCount });
  }
  return result.sort((a, b) => (a.host.name || '').localeCompare(b.host.name || ''));
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
 *  поля несуществующих ролей обнуляются (на хосте не бывает протокола СХД и наоборот).
 *  Косяк 7: у СХД нет CPU/RAM — обнуляем.
 *  Косяк 8: у консоли управления нет CPU/RAM/Диска — обнуляем.
 *  Косяк 11: кластер аккумулирует хосты и СХД, сам ресурсов не имеет (CPU/RAM/Диск = null),
 *  но может иметь гипервизор/версию как атрибуты платформы. */
export function normalizeServerPayload<T extends Record<string, any>>(data: T, isCreate: boolean): T {
  const out: any = { ...data };
  if (out.serverRole === '') out.serverRole = null;
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  out.hypervisorName = str(out.hypervisorName);
  out.clusterName = str(out.clusterName);
  out.hypervisorVersion = str(out.hypervisorVersion);
  out.parentClusterId = str(out.parentClusterId);
  // Санитарная логика по ролям
  if (out.serverRole !== 'hypervisor_host') {
    out.clusterName = null;
    out.hypervisorVersion = out.serverRole === 'cluster' ? out.hypervisorVersion : null;
    out.hypervisorName = out.serverRole === 'management_console' || out.serverRole === 'cluster' ? out.hypervisorName : null;
  }
  if (out.serverRole === 'cluster' && !out.clusterName) {
    // имя кластера совпадает с наименованием сервера, если не задано явно
    out.clusterName = str(out.name);
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
  // Косяк 11: кластер — только агрегатор, ресурсы нулевые.
  // МОЛ/инвентарный/серийный номера — атрибуты физической инвентарной карточки:
  // кластер не является материальным объектом учёта, поэтому у него их не бывает.
  if (out.serverRole === 'cluster') {
    out.cpuCores = null;
    out.ramGB = null;
    out.diskGB = null;
    out.parentClusterId = null; // кластер не может входить в другой кластер
    out.materiallyResponsibleEmployeeId = null;
    out.serialNumber = null;
    out.inventoryNumber = null;
  }
  // Косяк 7: СХД без CPU/RAM (диск-ёмкость — в storageCapacityGB)
  if (out.serverRole === 'storage') {
    out.cpuCores = null;
    out.ramGB = null;
    out.diskGB = null;
  }
  // Косяк 8: консоль управления без CPU/RAM/Диска
  if (out.serverRole === 'management_console') {
    out.cpuCores = null;
    out.ramGB = null;
    out.diskGB = null;
  }
  // Место размещения: ровно одно из двух — филиал (branchId) или ЦОД (dataCenterId).
  // Физический сервер может стоять как на филиале (своя серверная), так и в ЦОД
  // (арендованные/облачные мощности) — единый селект LocationSelect в форме.
  if (typeof out.branchId === 'string') out.branchId = out.branchId.trim() || null;
  if (typeof out.dataCenterId === 'string') out.dataCenterId = out.dataCenterId.trim() || null;
  if (out.dataCenterId && !out.branchId) out.locationType = 'data_center';
  else if (out.branchId && !out.dataCenterId) out.locationType = 'branch';
  else out.locationType = null;
  // Кластер-родитель обязателен только для хостов/СХД, которые помещают в кластер
  if (out.serverRole === 'hypervisor_host' || out.serverRole === 'storage') {
    /* parentClusterId остаётся как есть */
  } else {
    out.parentClusterId = null;
  }
  if (isCreate) out.category = out.serverRole === 'storage' ? 'storage' : 'server';
  return out as T;
}

/** Кластер виртуализации — логическая сущность, поэтому он создаётся отдельной
 *  формой (ClusterForm), а не общей формой физического сервера. Правила:
 *  - нет серийного/инвентарного номера, бренда и модели (это не «железо»);
 *  - состав формируется выбором существующих хостов / СХД / консолей управления
 *    (привязка через parentClusterId у выбранных единиц);
 *  - если физической инфраструктуры нет («Нет хостов» / «Нет СХД»), ресурсы
 *    вносятся вручную (CPU/RAM — для хостов, объём — для СХД).
 *  Функция собирает финальный payload Equipment c serverRole === 'cluster'. */
export interface ClusterManualResources {
  cpuCores: number | null;
  ramGB: number | null;
  storageCapacityGB: number | null;
}

export function normalizeClusterPayload<T extends Record<string, any>>(
  data: T,
  members: string[],
  manual: ClusterManualResources,
): T & { __members: string[] } {
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const numOrNull = (v: any) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
  const out: any = { ...data };
  // Пустые строки -> null, чтобы валидатор не отклонял необязательные поля
  // (name остаётся как есть — он обязателен и проверяется формой).
  for (const key of ['floor', 'room', 'notes', 'clusterName', 'hypervisorName', 'hypervisorVersion']) {
    if (typeof out[key] === 'string') out[key] = out[key].trim() || null;
  }
  // Место размещения: ровно одно из двух — филиал (branchId) или ЦОД (dataCenterId).
  // ClusterForm использует единый селект «Филиал / ЦОД»; здесь приводим пустые
  // строки к null и подставляем locationType (бэкенд проверяет его на POST).
  if (typeof out.branchId === 'string') out.branchId = out.branchId.trim() || null;
  if (typeof out.dataCenterId === 'string') out.dataCenterId = out.dataCenterId.trim() || null;
  if (out.dataCenterId && !out.branchId) out.locationType = 'data_center';
  else if (out.branchId && !out.dataCenterId) out.locationType = 'branch';
  else { out.locationType = null; }
  if ('assignedToEmployeeId' in out && (out.assignedToEmployeeId === '' || out.assignedToEmployeeId == null)) {
    out.assignedToEmployeeId = null;
  }
  // Инвентарная карточка у кластера отсутствует
  out.serialNumber = null;
  out.inventoryNumber = null;
  out.brand = null;
  out.model = null;
  // МОЛ — атрибут физической инвентарной карточки: кластер не является материальным
  // объектом учёта (это совокупность другого оборудования и консоли управления),
  // поэтому МОЛ у кластера не бывает. Гарантированно обнуляем при сохранении.
  out.materiallyResponsibleEmployeeId = null;
  out.serverRole = 'cluster';
  out.clusterName = str(out.clusterName) || str(out.name);
  out.hypervisorName = str(out.hypervisorName);
  out.hypervisorVersion = str(out.hypervisorVersion);
  out.parentClusterId = null; // кластер не может входить в другой кластер
  // Ручные ресурсы живут только при соответствующих чекбоксах «Нет хостов / Нет СХД»
  out.cpuCores = out.noHosts ? numOrNull(manual.cpuCores) : null;
  out.ramGB = out.noHosts ? numOrNull(manual.ramGB) : null;
  out.storageCapacityGB = out.noStorage ? numOrNull(manual.storageCapacityGB) : null;
  out.diskGB = null;
  // Поля СХД-роли кластеру не принадлежат (объём «руками» — в storageCapacityGB)
  out.storageType = null;
  out.storageProtocol = null;
  delete out.noHosts;
  delete out.noStorage;
  out.category = 'server';
  // Выбранные участники кластера (хосты/СХД/консоли) — применяются после создания
  out.__members = Array.isArray(members) ? members.filter(Boolean) : [];
  return out as T & { __members: string[] };
}


